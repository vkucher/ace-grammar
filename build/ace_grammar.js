/**
*
*   AceGrammar
*   @version: 0.1
*   Transform a grammar specification in JSON format,
*   into an ACE syntax-highlight parser mode
*
*   https://github.com/foo123/ace-grammar
*
**/
(function(root, undef){
    
    var VERSION = "0.1";
        
    //
    // parser types
    var    
        //
        // javascript variable types
        T_NUM = 2,
        T_BOOL = 4,
        T_STR = 8,
        T_CHAR= 9,
        T_REGEX = 16,
        T_ARRAY = 32,
        T_OBJ = 64,
        T_NULL = 128,
        T_UNDEF = 256,
        T_UNKNOWN = 512,
        
        //
        // matcher types
        T_SIMPLEMATCHER = 32,
        T_CHARMATCHER = 33,
        T_STRMATCHER = 34,
        T_REGEXMATCHER = 36,
        T_EOLMATCHER = 40,
        T_DUMMYMATCHER = 48,
        T_COMPOSITEMATCHER = 64,
        T_BLOCKMATCHER = 128,
        
        //
        // token types
        T_OPTIONAL = 1,
        T_REQUIRED = 2,
        T_ERROR = 4,
        T_DEFAULT = 8,
        T_SIMPLE = 16,
        T_ESCBLOCK = 32,
        T_BLOCK = 64,
        T_EITHER = 128,
        T_ALL = 256,
        T_ZEROORONE = 512,
        T_ZEROORMORE = 1024,
        T_ONEORMORE = 2048,
        T_GROUP = 4096,
        T_NGRAM = 8192,
        /*T_ACTION = 16384,
        T_INDENT = 16385,
        T_OUTDENT = 16386,*/
        
        //
        // tokenizer types
        /*actionTypes = {
            "INDENT" : T_INDENT, "OUTDENT" : T_OUTDENT
        },*/
        
        groupTypes = {
            "ONEOF" : T_EITHER, "EITHER" : T_EITHER, "ALL" : T_ALL, "ALLOF" : T_ALL, "ZEROORONE" : T_ZEROORONE, "ZEROORMORE" : T_ZEROORMORE, "ONEORMORE" : T_ONEORMORE
        },
        
        tokenTypes = {
            "BLOCK" : T_BLOCK, "ESCAPED-BLOCK" : T_ESCBLOCK, "SIMPLE" : T_SIMPLE, "GROUP" : T_GROUP, "NGRAM" : T_NGRAM, "N-GRAM" : T_NGRAM/*, "ACTION" : T_ACTION*/
        }
    ;
    
    var slice = Array.prototype.slice, splice = Array.prototype.splice, concat = Array.prototype.concat, 
        hasKey = Object.prototype.hasOwnProperty, Str = Object.prototype.toString,
        
        RegexAnalyzer,
        
        Merge = function(o1, o2) { 
            o1 = o1 || {}; 
            for (var p in o2) 
                if ( hasKey.call(o2, p) )  o1[p] = o2[p];  
            
            return o1; 
        },
        
        Extends = function(Parent, ChildProto) {
            var O = function(){}; 
            var C = ChildProto.constructor;
            O.prototype = Parent.prototype;
            C.prototype = new O();
            C.prototype.constructor = C;
            C.prototype = Merge( C.prototype, ChildProto );
            return C;
        },
        
        get_type = function(v) {
            var type_of = typeof(v), to_string = Str.call(v);
            
            if ('number' == type_of || v instanceof Number)  return T_NUM;
            
            else if (true === v || false === v)  return T_BOOL;
            
            else if (v && ('string' == type_of || v instanceof String))  return (1 == v.length) ? T_CHAR : T_STR;
            
            else if (v && ("[object RegExp]" == to_string || v instanceof RegExp))  return T_REGEX;
            
            else if (v && ("[object Array]" == to_string || v instanceof Array))  return T_ARRAY;
            
            else if (v && "[object Object]" == to_string)  return T_OBJ;
            
            else if (null === v)  return T_NULL;
            
            else if (undef === v)  return T_UNDEF;
            
            // unkown type
            return T_UNKNOWN;
        },
        
        make_array = function(a, force) {
            return ( force || T_ARRAY != get_type( a ) ) ? [ a ] : a;
        },
        
        make_array_2 = function(a, force) {
            a = make_array( a, force );
            if ( force || T_ARRAY != get_type( a[0] ) ) a = [ a ]; // array of arrays
            return a;
        },
        
        clone = function(o) {
            var T = get_type( o ), T2;
            
            if (T_OBJ != T && T_ARRAY != T) return o;
            
            var co = {}, k;
            for (k in o) 
            {
                if ( hasKey.call(o, k) ) 
                { 
                    T2 = get_type( o[k] );
                    
                    if (T_OBJ == T2)  co[k] = clone(o[k]);
                    
                    else if (T_ARRAY == T2)  co[k] = o[k].slice();
                    
                    else  co[k] = o[k]; 
                }
            }
            return co;
        },
        
        extend = function() {
            var args = slice.call(arguments), argslen = args.length;
            
            if ( argslen<1 ) return null;
            else if ( argslen<2 ) return clone( args[0] );
            
            var o1 = args.shift(), o2, o = clone(o1), i, k, T; 
            argslen--;            
            
            for (i=0; i<argslen; i++)
            {
                o2 = args.shift();
                if ( !o2 ) continue;
                
                for (k in o2) 
                { 
                    if ( hasKey.call(o2, k) )
                    {
                        if ( hasKey.call(o1, k) ) 
                        { 
                            T = get_type( o1[k] );
                            
                            if ( (T_OBJ & ~T_STR) & T)  o[k] = extend( o1[k], o2[k] );
                            
                            //else if (T_ARRAY == T)  o[k] = o1[k].slice();
                            
                            //else  o[k] = o1[k];
                        }
                        else
                        {
                            o[k] = clone( o2[k] );
                        }
                    }
                }
            }
            return o;
        }
    ;
    
    //
    // matcher factories
    var ESC = /([\-\.\*\+\?\^\$\{\}\(\)\|\[\]\/\\])/g,
        
        byLength = function(a, b) { return b.length - a.length },
        
        hasPrefix = function(s, id) {
            return (
                (T_STR & get_type(id)) && (T_STR & get_type(s)) && id.length &&
                id.length <= s.length && id == s.substr(0, id.length)
            );
        },
        
        getRegexp = function(r, rid, parsedRegexes)  {
            if ( !r || (T_NUM == get_type(r)) ) return r;
            
            var l = (rid) ? (rid.length||0) : 0;
            
            if ( l && rid == r.substr(0, l) ) 
            {
                var regexID = "^(" + r.substr(l) + ")", regex, peek, analyzer;
                
                if ( !parsedRegexes[ regexID ] )
                {
                    regex = new RegExp( regexID );
                    analyzer = new RegexAnalyzer( regex ).analyze();
                    peek = analyzer.getPeekChars();
                    //console.log(analyzer.regex);
                    //console.log(peek);
                    if ( !Object.keys(peek.peek).length )  peek.peek = null;
                    if ( !Object.keys(peek.negativepeek).length )  peek.negativepeek = null;
                    
                    // shared, light-weight
                    parsedRegexes[ regexID ] = [ regex, peek ];
                }
                
                return parsedRegexes[ regexID ];
            }
            else
            {
                return r;
            }
        },
        
        getCombinedRegexp = function(tokens, boundary)  {
            var peek = { }, i, l, b = "";
            if ( T_STR == get_type(boundary)) b = boundary;
            for (i=0, l=tokens.length; i<l; i++) 
            {
                peek[ tokens[i].charAt(0) ] = 1;
                tokens[i] = tokens[i].replace(ESC, '\\$1');
            }
            //return [ new RegExp("^((" + tokens.sort( byLength ).join( ")|(" ) + "))\\b"), { peek: peek, negativepeek: null } ];
            return [ new RegExp("^(" + tokens.sort( byLength ).join( "|" ) + ")"+b), { peek: peek, negativepeek: null }, 1 ];
        },
        
        DummyMatcher = Extends( Object, {
            
            constructor : function(name, pattern, key, type) {
                this.name = name;
                this.pattern = pattern;
                this.key = key || 0;
                this.type = type || T_DUMMYMATCHER;
            },
            
            name : null,
            pattern : null,
            peek : null,
            type : null,
            key : 0,
            
            toString : function() {
                var s = '[';
                s += 'Matcher: ' + this.name;
                s += ', Type: ' + this.type;
                s += ', Pattern: ' + ((this.pattern) ? this.pattern.toString() : null);
                s += ']';
                return s;
            },
            
            test : function(str) {
                return true;
            },
            
            match : function(stream, eat) { 
                return [ this.key, this.pattern ];
            }
        }),
        
        // get a fast customized matcher for < pattern >
        
        // manipulate the codemirror stream directly for speed,
        // if codemirror code for stream matching changes,
        // only this part of the code needs to be adapted
        
        CharMatcher = Extends( DummyMatcher, {
            
            constructor : function(name, pattern, key) {
                this.name = name;
                this.pattern = pattern;
                this.type = T_CHARMATCHER;
                this.key = key || 0;
            },
            
            test : function(str) {
                return (this.pattern == str.charAt(0));
            },
            
            match : function(stream, eat) {
                    
                // manipulate the codemirror stream directly for speed
                eat = (false !== eat);
                var ch = stream.string.charAt(stream.pos) || '';
                if (this.pattern == ch) 
                {
                    if (eat) stream.pos += 1;
                    return [ this.key, ch ];
                }
                return false;
            }
        }),
        
        StrMatcher = Extends( DummyMatcher, {
            
            constructor : function(name, pattern, key) {
                this.name = name;
                this.pattern = pattern;
                this.peek = { peek: {}, negativepeek: null };
                this.peek.peek[ '' + pattern.charAt(0) ] = 1;
                this.type = T_STRMATCHER;
                this.key = key || 0;
            },
            
            test : function(str) {
                var ch = str.charAt(0);
                if ( this.peek.peek[ ch ] )
                {
                    var len = this.pattern.length, s = str.substr(0, len);
                    if (this.pattern == s) return true;
                }
                return false;
            },
            
            match : function(stream, eat) {
                
                // manipulate the codemirror stream directly for speed
                eat = (false !== eat);
                var pos = stream.pos, ch = stream.string.charAt(pos);
                if ( this.peek.peek[ ch ] )
                {
                    var len = this.pattern.length, str = stream.string.substr(pos, len);
                    if (this.pattern == str) 
                    {
                        if (eat) stream.pos += len;
                        return [ this.key, str ];
                    }
                }
                return false;
            }
        }),
        
        RegexMatcher = Extends( DummyMatcher, {
            
            constructor : function(name, pattern, key) {
                this.name = name;
                this.pattern = pattern[ 0 ];
                this.peek = pattern[ 1 ];
                this.isComposite = pattern[2] || 0;
                this.type = T_REGEXMATCHER;
                this.key = key || 0;
            },
            
            isComposite : 0,
            
            test : function(str) {
                var ch = str.charAt(0);
                if ( ( this.peek.peek && this.peek.peek[ ch ] ) || ( this.peek.negativepeek && !this.peek.negativepeek[ ch ] ) )
                {
                    var match = str.match(this.pattern);
                    if (!match || match.index > 0) return false;
                    return true;
                }
                return false;
            },
            
            match : function(stream, eat) {
                
                // manipulate the codemirror stream directly for speed
                eat = (false !== eat);
                var pos = stream.pos, ch = stream.string.charAt(pos);
                if ( ( this.peek.peek && this.peek.peek[ ch ] ) || ( this.peek.negativepeek && !this.peek.negativepeek[ ch ] ) )
                {
                    var match = stream.string.slice(pos).match(this.pattern);
                    if (!match || match.index > 0) return false;
                    if (eat) stream.pos += match[this.isComposite].length;
                    return [ this.key, match ];
                }
                return false;
            }
        }),
        
        EolMatcher = Extends( DummyMatcher, {
            
            constructor : function(name, pattern, key) {
                this.name = name;
                this.type = T_EOLMATCHER;
                this.key = key || 0;
            },
            
            match : function(stream, eat) { 
                // manipulate the codemirror stream directly for speed
                if (false !== eat) stream.pos = stream.string.length; // skipToEnd
                return [ this.key, "" ];
            }
        }),
        
        getSimpleMatcher = function(tokenID, pattern, key, parsedMatchers) {
            // get a fast customized matcher for < pattern >
            
            // manipulate the codemirror stream directly for speed,
            // if codemirror code for stream matching changes,
            // only this part of the code needs to be adapted
            
            key = key || 0;
            
            var name = tokenID + '_SimpleMatcher', matcher;
            
            var T = get_type( pattern );
            
            if ( T_NUM == T ) return pattern;
            
            if ( !parsedMatchers[ name ] )
            {
                if ( T_BOOL == T ) matcher = new DummyMatcher(name, pattern, key);
                
                else if ( T_NULL == T ) matcher = new EolMatcher(name, pattern, key);
                
                else if ( T_CHAR == T ) matcher = new CharMatcher(name, pattern, key);
                
                else if ( T_STR == T ) matcher = new StrMatcher(name, pattern, key);
                
                else if ( /*T_REGEX*/T_ARRAY == T ) matcher = new RegexMatcher(name, pattern, key);
                
                // unknown
                else matcher = pattern;
                
                parsedMatchers[ name ] = matcher;
            }
            
            return parsedMatchers[ name ];
        },
        
        CompositeMatcher = Extends( DummyMatcher, {
            
            constructor : function(name, matchers, useOwnKey) {
                this.name = name;
                this.matchers = matchers;
                this.type = T_COMPOSITEMATCHER;
                this.useOwnKey = (false!==useOwnKey);
            },
            
            matchers : null,
            useOwnKey : true,
            
            test : function(str) {
                var i, m, matchers = this.matchers, l = matchers.length;
                for (i=0; i<l; i++)
                {
                    // each one is a custom matcher in its own
                    m = matchers[i].test(str);
                    if ( m ) return true;
                }
                return false;
            },
            
            match : function(stream, eat) {
                var i, m, matchers = this.matchers, l = matchers.length;
                for (i=0; i<l; i++)
                {
                    // each one is a custom matcher in its own
                    m = matchers[i].match(stream, eat);
                    if ( m ) return ( this.useOwnKey ) ? [ i, m[1] ] : m;
                }
                return false;
            }
        }),
        
        getCompositeMatcher = function(tokenID, tokens, RegExpID, isRegExpGroup, parsedRegexes, parsedMatchers) {
            
            var tmp, i, l, l2, array_of_arrays = false, has_regexs = false;
            
            var name = tokenID + '_CompoMatcher', matcher;
            
            if ( !parsedMatchers[ name ] )
            {
                tmp = make_array( tokens );
                l = tmp.length;
                
                if ( isRegExpGroup )
                {   
                    l2 = (l>>1) + 1;
                    // check if tokens can be combined in one regular expression
                    // if they do not contain sub-arrays or regular expressions
                    for (i=0; i<=l2; i++)
                    {
                        if ( (T_ARRAY == get_type( tmp[i] )) || (T_ARRAY == get_type( tmp[l-1-i] )) ) 
                        {
                            array_of_arrays = true;
                            break;
                        }
                        else if ( hasPrefix( tmp[i], RegExpID ) || hasPrefix( tmp[l-1-i], RegExpID ) )
                        {
                            has_regexs = true;
                            break;
                        }
                    }
                }
                
                if ( isRegExpGroup && !(array_of_arrays || has_regexs) )
                {   
                    matcher = getSimpleMatcher( name, getCombinedRegexp( tmp, isRegExpGroup ), 0, parsedMatchers );
                }
                else
                {
                    for (i=0; i<l; i++)
                    {
                        if ( T_ARRAY == get_type( tmp[i] ) )
                            tmp[i] = getCompositeMatcher( name + '_' + i, tmp[i], RegExpID, isRegExpGroup, parsedRegexes, parsedMatchers );
                        else
                            tmp[i] = getSimpleMatcher( name + '_' + i, getRegexp( tmp[i], RegExpID, parsedRegexes ), i, parsedMatchers );
                    }
                    
                    matcher = (tmp.length > 1) ? new CompositeMatcher( name, tmp ) : tmp[0];
                }
                
                parsedMatchers[ name ] = matcher;
            }
            
            return parsedMatchers[ name ];
        },
        
        BlockMatcher = Extends( DummyMatcher, {
            
            constructor : function(name, start, end) {
                this.name = name;
                this.type = T_BLOCKMATCHER;
                this.start = new CompositeMatcher(this.name + '_StartMatcher', start, false);
                this.pattern = this.start.pattern || null;
                this.end = end;
            },
            
            start : null,
            end : null,
            
            test : function(str) {
                return this.start.test(str);
            },
            
            match : function(stream, eat) {
                    
                var token = this.start.match(stream, eat);
                
                if ( token )
                {
                    var endMatcher = this.end[ token[0] ];
                    
                    // regex given, get the matched group for the ending of this block
                    if ( T_NUM == get_type( endMatcher ) )
                    {
                        // the regex is wrapped in an additional group, 
                        // add 1 to the requested regex group transparently
                        endMatcher = new StrMatcher( this.name + '_EndMatcher', token[1][ endMatcher+1 ] );
                    }
                    
                    return endMatcher;
                }
                
                return false;
            }
        }),
        
        getBlockMatcher = function(tokenID, tokens, RegExpID, parsedRegexes, parsedMatchers) {
            var tmp, i, l, start, end, t1, t2;
            
            var name = tokenID + '_BlockMatcher';
            
            if ( !parsedMatchers[ name ] )
            {
                // build start/end mappings
                start=[]; end=[];
                tmp = make_array_2(tokens); // array of arrays
                for (i=0, l=tmp.length; i<l; i++)
                {
                    t1 = getSimpleMatcher( name + '_0_' + i, getRegexp( tmp[i][0], RegExpID, parsedRegexes ), i, parsedMatchers );
                    t2 = (tmp[i].length>1) ? getSimpleMatcher( name + '_1_' + i, getRegexp( tmp[i][1], RegExpID, parsedRegexes ), i, parsedMatchers ) : t1;
                    start.push( t1 );  end.push( t2 );
                }
                
                parsedMatchers[ name ] = new BlockMatcher(name, start, end);
            }
            
            return parsedMatchers[ name ];
        }
    ;
    
    //
    // tokenizer factories
    var
        // state scope/context
        /*Context = function( args ) {
            if ( args )
            {
                for (var p in args)  
                    this[p] = args[p];
            }
        },
        
        pushContext = function(state, ctx) {
            ctx.prev = state.context || null;
            return state.context = new Context( ctx );
        },
        
        popContext = function(state) {
            if ( state.context )
                state.context = state.context.prev || null;
            return state.context;
        },
            
        Action = Extends( Object, {
            
            constructor : function(name, action, token) {
                this.type = T_ACTION;
                this.name = name || null;
                this.action = (action) ? actionTypes[ action.toUpperCase() ] : null;
                this.token = token || null;
            },    
            
            type : null,
            name : null,
            action : null,
            token : null,
            
            toString : function() {
                return '[Action: ' + ((T_INDENT == this.action) ? 'INDENT' : 'OUTDENT') + ']';
            },
            
            doAction : function(stream, state, LOCALS) {
                
                var indentUnit = LOCALS.conf.indentUnit;
                
                if ( T_INDENT == this.action )
                {
                    //if ( !state.context || state.context.type != state.current )
                    console.log('indent action')
                    pushContext( state, { token: state.current, current: stream.current(), indentation: stream.indentation() + indentUnit } );
                }
                
                else if ( T_OUTDENT == this.action )
                {
                    if ( state.context )
                    {
                        state.context.textAfter = function( textAfter, state ) {
                            popContext( state );
                            return ( state.context ) ? (state.context.indentation) : 0;
                        };
                    }
                }
                
                return true;
            }
        }),
        */
        SimpleTokenizer = Extends( Object, {
            
            constructor : function(name, token, type, style) {
                if (name) this.name = name;
                if (token) this.token = token;
                if (type) this.type = type;
                if (style) this.style = style;
                this.tokenName = this.name;
            },
            
            name : null,
            token : null,
            tokenName : null,
            type : null,
            style : null,
            isRequired : false,
            ERROR : false,
            streamPos : null,
            stackPos : null,
            actionBefore : null,
            actionAfter : null,
            
            toString : function() {
                var s = '[';
                s += 'Tokenizer: ' + this.name;
                s += ', Type: ' + this.type;
                s += ', Token: ' + ((this.token) ? this.token.toString() : null);
                s += ']';
                return s;
            },
            
            required : function(bool) { 
                this.isRequired = (bool) ? true : false;
                return this;
            },
            
            backTrack : function(stream) {
                stream.pos -= (stream.pos - this.streamPos);
                return this;
            },
            
            pushToken : function(stack, token, i) {
                if ( this.stackPos )
                    stack.splice( this.stackPos+(i||0), 0, token );
                else
                    stack.push( token );
                return this;
            },
            
            clone : function(/* variable args here.. */) {
                
                var args = slice.call(arguments);
                
                if (args.length)
                {
                    var thisClass = args.shift();
                    
                    var argslen = args.length;
                    
                    var t = new thisClass();
                    
                    t.name = this.name;
                    t.type = this.type;
                    t.isRequired = this.isRequired;
                    t.ERROR = this.ERROR;
                    t.actionBefore = this.actionBefore;
                    t.actionAfter = this.actionAfter;
                    
                    for (var i=0; i<argslen; i++)   
                    {
                        t[ args[i] ] = this[ args[i] ];
                    }
                    
                    return t;
                }
                
                return null;
            },
            
            test : function(textAfter) {
                return this.token.test( textAfter );
            },
            
            tokenize : function( stream, state, LOCALS ) {
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                if ( this.token.match(stream) )
                {
                    state.currentToken = this.type;
                    /*if ( this.actionAfter )
                    {
                        this.actionAfter.doAction(stream, state, LOCALS);
                    }*/
                    return this.style;
                }
                
                return false;
            }
        }),
        
        BlockTokenizer = Extends( SimpleTokenizer, {
            
            constructor : function(name, token, type, style, multiline) {
                if (name) this.name = name;
                if (token) this.token = token;
                if (type) this.type = type;
                if (style) this.style = style;
                this.multiline = (false!==multiline);
                this.endBlock = null;
                this.tokenName = this.name;
            },    
            
            multiline : false,
            endBlock : null,
            
            tokenize : function( stream, state, LOCALS ) {
            
                var ended = false, found = false;
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                if ( state.inBlock == this.name )
                {
                    found = true;
                    this.endBlock = state.endBlock;
                }    
                else if ( !state.inBlock && (this.endBlock = this.token.match(stream)) )
                {
                    found = true;
                    state.inBlock = this.name;
                    state.endBlock = this.endBlock;
                }    
                
                if ( found )
                {
                    this.stackPos = state.stack.length;
                    ended = this.endBlock.match(stream);
                    
                    while ( !ended && !stream.eol() ) 
                    {
                        //stream.next();
                        if ( this.endBlock.match(stream) ) 
                        {
                            ended = true;
                            break;
                        }
                        else  
                        {
                            stream.next();
                        }
                    }
                    
                    ended = ( ended || ( !this.multiline && stream.eol() ) );
                    
                    if ( !ended )
                    {
                        this.pushToken( state.stack, this );
                    }
                    else
                    {
                        state.inBlock = null;
                        state.endBlock = null;
                        
                        /*if ( this.actionAfter )
                        {
                            this.actionAfter.doAction(stream, state, LOCALS);
                        }*/
                    }
                    
                    state.currentToken = this.type;
                    return this.style;
                }
                
                state.inBlock = null;
                state.endBlock = null;
                return false;
            }
        }),
                
        EscBlockTokenizer = Extends( BlockTokenizer, {
            
            constructor : function(name, token, type, style, escape, multiline) {
                if (name) this.name = name;
                if (token) this.token = token;
                if (type) this.type = type;
                if (style) this.style = style;
                if (escape) this.escape = escape || "\\";
                if (multiline) this.multiline = multiline || false;
                this.endBlock = null;
                this.isEscaped = false;
                this.tokenName = this.name;
            },    
            
            escape : "\\",
            
            tokenize : function( stream, state, LOCALS ) {
            
                var next = "", ended = false, found = false, isEscaped = false;
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                if ( state.inBlock == this.name )
                {
                    found = true;
                    this.endBlock = state.endBlock;
                }    
                else if ( !state.inBlock && (this.endBlock = this.token.match(stream)) )
                {
                    found = true;
                    state.inBlock = this.name;
                    state.endBlock = this.endBlock;
                }    
                
                if ( found )
                {
                    state.inBlock = this.name;
                    this.stackPos = state.stack.length;
                    ended = this.endBlock.match(stream);
                    
                    while ( !ended && !stream.eol() ) 
                    {
                        //stream.next();
                        if ( !isEscaped && this.endBlock.match(stream) ) 
                        {
                            ended = true; 
                            break;
                        }
                        else  
                        {
                            next = stream.next();
                        }
                        isEscaped = !isEscaped && next == this.escape;
                    }
                    
                    ended = ended || !(isEscaped && this.multiline);
                    
                    if ( !ended )
                    {
                        this.pushToken( state.stack, this );
                    }
                    else
                    {
                        state.inBlock = null;
                        state.endBlock = null;
                        
                        /*if ( this.actionAfter )
                        {
                            this.actionAfter.doAction(stream, state, LOCALS);
                        }*/
                    }
                    
                    state.currentToken = this.type;
                    return this.style;
                }
                
                state.inBlock = null;
                state.endBlock = null;
                return false;
            }
        }),
                
        CompositeTokenizer = Extends( SimpleTokenizer, {
            
            constructor : function(name, type) {
                if (name) this.name = name;
                if (type) this.type = type;
                this.tokenName = this.name;
            },
            
            tokens : null,
            
            buildTokens : function( tokens ) {
                if ( tokens )
                {
                    this.tokens = make_array( tokens );
                    this.token = this.tokens[0];
                }
                return this;
            }
        }),
        
        ZeroOrOneTokens = Extends( CompositeTokenizer, {
                
            constructor : function( name, tokens ) {
                this.type = T_ZEROORONE;
                if (name) this.name = name;
                if (tokens) this.buildTokens( tokens );
                this.tokenName = this.name;
            },
            
            test : function(textAfter) {
                return this.token.test( textAfter );
            },
            
            tokenize : function( stream, state, LOCALS ) {
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                // this is optional
                this.isRequired = false;
                this.ERROR = false;
                this.streamPos = stream.pos;
                var style = this.token.tokenize(stream, state);
                
                if ( token.ERROR ) this.backTrack( stream );
                
                /*if ( style && this.actionAfter )
                {
                    this.actionAfter.doAction(stream, state, LOCALS);
                }*/

                return style;
            }
        }),
        
        ZeroOrMoreTokens = Extends( CompositeTokenizer, {
                
            constructor : function( name, tokens ) {
                this.type = T_ZEROORMORE;
                if (name) this.name = name;
                if (tokens) this.buildTokens( tokens );
                this.tokenName = this.name;
            },
            
            test : function(textAfter) {
                var ret;
                for (var i=0, n=this.tokens.length; i<n; i++)
                {
                    ret = this.tokens[i].test( textAfter );
                    if (ret) return true;
                }
                return false;
            },
            
            tokenize : function( stream, state, LOCALS ) {
            
                var i, token, style, n = this.tokens.length, tokensErr = 0, ret = false;
                
                // this is optional
                this.isRequired = false;
                this.ERROR = false;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                for (i=0; i<n; i++)
                {
                    token = this.tokens[i];
                    style = token.tokenize(stream, state, LOCALS);
                    
                    if ( false !== style )
                    {
                        // push it to the stack for more
                        this.pushToken( state.stack, this );
                        
                        /*if ( this.actionAfter )
                        {
                            this.actionAfter.doAction(stream, state, LOCALS);
                        }*/
                        
                        return style;
                    }
                    else if ( token.ERROR )
                    {
                        tokensErr++;
                        this.backTrack( stream );
                    }
                }
                
                //this.ERROR = (n == tokensErr) ? true : false;
                return false;
            }
        }),
        
        OneOrMoreTokens = Extends( CompositeTokenizer, {
                
            constructor : function( name, tokens ) {
                this.type = T_ONEORMORE;
                if (name) this.name = name;
                if (tokens) this.buildTokens( tokens );
                this.foundOne = false;
                this.tokenName = this.name;
            },
            
            foundOne : false,
            
            test : function(textAfter) {
                var ret;
                for (var i=0, n=this.tokens.length; i<n; i++)
                {
                    ret = this.tokens[i].test( textAfter );
                    if (ret) return true;
                }
                return false;
            },
            
            tokenize : function( stream, state, LOCALS ) {
        
                var style, token, i, n = this.tokens.length, tokensRequired = 0, tokensErr = 0;
                
                this.isRequired = !this.foundOne;
                this.ERROR = false;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                for (i=0; i<n; i++)
                {
                    token = this.tokens[i];
                    style = token.tokenize(stream, state, LOCALS);
                    
                    tokensRequired += (token.isRequired) ? 1 : 0;
                    
                    if ( false !== style )
                    {
                        this.foundOne = true;
                        this.isRequired = false;
                        this.ERROR = false;
                        // push it to the stack for more
                        this.pushToken( state.stack, this.clone(OneOrMoreTokens, "tokens", "foundOne") );
                        this.foundOne = false;
                        
                        /*if ( this.actionAfter )
                        {
                            this.actionAfter.doAction(stream, state, LOCALS);
                        }*/
                        
                        return style;
                    }
                    else if ( token.ERROR )
                    {
                        tokensErr++;
                        this.backTrack( stream );
                    }
                }
                
                this.ERROR = (!this.foundOne /*|| n == tokensErr*/) ? true : false;
                return false;
            }
        }),
        
        EitherTokens = Extends( CompositeTokenizer, {
                
            constructor : function( name, tokens ) {
                this.type = T_EITHER;
                if (name) this.name = name;
                if (tokens) this.buildTokens( tokens );
                this.tokenName = this.name;
            },
            
            test : function(textAfter) {
                var ret;
                for (var i=0, n=this.tokens.length; i<n; i++)
                {
                    ret = this.tokens[i].test( textAfter );
                    if (ret) return true;
                }
                return false;
            },
            
            tokenize : function( stream, state, LOCALS ) {
            
                var style, token, i, n = this.tokens.length, tokensRequired = 0, tokensErr = 0;
                
                this.isRequired = true;
                this.ERROR = false;
                this.streamPos = stream.pos;
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                for (i=0; i<n; i++)
                {
                    token = this.tokens[i];
                    style = token.tokenize(stream, state, LOCALS);
                    
                    tokensRequired += (token.isRequired) ? 1 : 0;
                    
                    if ( false !== style )
                    {
                        /*if ( this.actionAfter )
                        {
                            this.actionAfter.doAction(stream, state, LOCALS);
                        }*/
                        
                        return style;
                    }
                    else if ( token.ERROR )
                    {
                        tokensErr++;
                        this.backTrack( stream );
                    }
                }
                
                this.isRequired = (tokensRequired > 0) ? true : false;
                this.ERROR = (n == tokensErr && tokensRequired > 0) ? true : false;
                return false;
            }
        }),
                
        AllTokens = Extends( CompositeTokenizer, {
                
            constructor : function( name, tokens ) {
                this.type = T_ALL;
                if (name) this.name = name;
                if (tokens) this.buildTokens( tokens );
                this.tokenName = this.name;
            },
            
            test : function(textAfter) {
                return this.tokens[this.tokens.length-1].test( textAfter );
            },
            
            tokenize : function( stream, state, LOCALS ) {
                
                var token, style, n = this.tokens.length, ret = false, off=0;
                
                this.isRequired = true;
                this.ERROR = false;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                token = this.tokens[ 0 ];
                style = token.required(true).tokenize(stream, state, LOCALS);
                
                if ( false !== style )
                {
                    this.stackPos = state.stack.length;
                    /*if ( this.actionAfter )
                    {
                        this.pushToken( state.stack, this.actionAfter, 1 );
                        off=1;
                    }*/
                    for (var i=n-1; i>0; i--)
                    {
                        this.pushToken( state.stack, this.tokens[i].required(true), n-i+off );
                    }
                    
                    ret = style;
                    
                }
                else if ( token.ERROR )
                {
                    this.ERROR = true;
                    this.backTrack( stream );
                }
                else if ( token.isRequired )
                {
                    this.ERROR = true;
                }
                
                return ret;
            }
        }),
                
        NGramTokenizer = Extends( CompositeTokenizer, {
                
            constructor : function( name, tokens ) {
                this.type = T_NGRAM;
                if (name) this.name = name;
                if (tokens) this.buildTokens( tokens );
                this.tokenName = this.tokens[0].name;
            },
            
            test : function( textAfter ) {
                return this.tokens[this.tokens.length-1].test( textAfter );
            },
            
            tokenize : function( stream, state, LOCALS ) {
                
                var token, style, n = this.tokens.length, ret = false, off=0;
                
                this.isRequired = false;
                this.ERROR = false;
                this.streamPos = stream.pos;
                this.stackPos = state.stack.length;
                
                
                /*if ( this.actionBefore )
                {
                    this.actionBefore.doAction(stream, state, LOCALS);
                }*/
                
                token = this.tokens[ 0 ];
                style = token.required(false).tokenize(stream, state, LOCALS);
                
                if ( false !== style )
                {
                    this.stackPos = state.stack.length;
                    /*if ( this.actionAfter )
                    {
                        console.log('pushed action after: '+this.actionAfter.toString());
                        this.pushToken( state.stack, this.actionAfter, 1 );
                        off=1;
                    }*/
                    for (var i=n-1; i>0; i--)
                    {
                        this.pushToken( state.stack, this.tokens[i].required(true), n-i+off );
                    }
                    
                    ret = style;
                }
                else if ( token.ERROR )
                {
                    //this.ERROR = true;
                    this.backTrack( stream );
                }
                
                return ret;
            }
        }),
                
        getTokenizer = function(tokenID, RegExpID, RegExpGroups, Lex, Syntax, Style, parsedRegexes, parsedMatchers, parsedTokens) {
            
            var tok, token = null, type, matchType, tokens, action;
            
            if ( !parsedTokens[ tokenID ] )
            {
                tok = Lex[ tokenID ] || Syntax[ tokenID ] || null;
                
                if ( tok )
                {
                    type = tok.type || "simple";
                    type = tokenTypes[ type.toUpperCase() ];
                    action = tok.action || null;
                    
                    if ( T_BLOCK == type )
                    {
                        token = new BlockTokenizer( 
                                    tokenID,
                                    getBlockMatcher( tokenID, tok.tokens.slice(), RegExpID, parsedRegexes, parsedMatchers ), 
                                    type, 
                                    Style[ tokenID ] || "invisible",
                                    tok.multiline
                                );
                    }
                    
                    else if ( T_ESCBLOCK == type )
                    {
                        token = new EscBlockTokenizer( 
                                    tokenID,
                                    getBlockMatcher( tokenID, tok.tokens.slice(), RegExpID, parsedRegexes, parsedMatchers ), 
                                    type, 
                                    Style[ tokenID ] || "invisible",
                                    tok.escape || "\\",
                                    tok.multiline || false
                                );
                    }
                    
                    else if ( T_SIMPLE == type )
                    {
                        token = new SimpleTokenizer( 
                                    tokenID,
                                    getCompositeMatcher( tokenID, tok.tokens.slice(), RegExpID, RegExpGroups[ tokenID ], parsedRegexes, parsedMatchers ), 
                                    type, 
                                    Style[ tokenID ] || "invisible"
                                );
                    }
                    
                    else if ( T_GROUP == type )
                    {
                        matchType = groupTypes[ tok.match.toUpperCase() ]; 
                        tokens = make_array( tok.tokens ).slice();
                        
                        for (var i=0, l=tokens.length; i<l; i++)
                            tokens[i] = getTokenizer(tokens[i], RegExpID, RegExpGroups, Lex, Syntax, Style, parsedRegexes, parsedMatchers, parsedTokens);
                        
                        if (T_ZEROORONE == matchType) 
                            token = new ZeroOrOneTokens(tokenID, tokens);
                        
                        else if (T_ZEROORMORE == matchType) 
                            token = new ZeroOrMoreTokens(tokenID, tokens);
                        
                        else if (T_ONEORMORE == matchType) 
                            token = new OneOrMoreTokens(tokenID, tokens);
                        
                        else if (T_EITHER == matchType) 
                            token = new EitherTokens(tokenID, tokens);
                        
                        else //if (T_ALL == matchType)
                            token = new AllTokens(tokenID, tokens);
                    }
                    
                    else if ( T_NGRAM == type )
                    {
                        // get n-gram tokenizer
                        token = make_array_2( make_array( tok.tokens ).slice() ).slice(); // array of arrays
                        
                        for (var i=0, l=token.length; i<l; i++)
                        {
                            // get tokenizers for each ngram part
                            var ngram = token[i];
                            
                            for (var j=0, l2=ngram.length; j<l2; j++)
                                ngram[j] = getTokenizer( ngram[j], RegExpID, RegExpGroups, Lex, Syntax, Style, parsedRegexes, parsedMatchers, parsedTokens );
                            
                            // get a tokenizer for whole ngram
                            token[i] = new NGramTokenizer( tokenID + '_NGRAM_' + i, ngram );
                        }
                    }
                }
                /*
                if ( action )
                {
                    if ( T_ARRAY == get_type(action) )
                    {
                        if (action[1] && action[1].toLowerCase() == "before" )
                            token.actionBefore = new Action( tokenID, action[0], token );
                        
                        else
                            token.actionAfter = new Action( tokenID, action[0], token );
                    }
                    else
                    {
                        token.actionAfter = new Action( tokenID, action, token );
                    }
                }
                */    
                parsedTokens[ tokenID ] = token;
            }
            
            return parsedTokens[ tokenID ];
        }
    ;
      
    //
    // parser factories
    var
        /*stackTrace = function(stack) {
            console.log( "Stack Trace Begin" );
            
            for (var i=stack.length-1; i>=0; i--)
                console.log( stack[i].toString() );
            
            console.log( "Stack Trace End" );
        },*/
        
        // a class resembling Codemirror StringStream for compatibility mode
        Stream = Extends(Object, {
            
            constructor: function( line ) {
                this.string = line;
                this.pos = this.start = 0;
            },
            
            string: '',
            start: 0,
            pos: 0,
            
            eol: function() { 
                return this.pos >= this.string.length; 
            },
            
            sol: function() { 
                return 0 == this.pos; 
            },
            
            peek: function() { 
                return this.string.charAt(this.pos) || undefined; 
            },
            
            next: function() {
                if (this.pos < this.string.length)
                    return this.string.charAt(this.pos++);
            },
            
            eat: function(match) {
                var ch = this.string.charAt(this.pos);
                if ("string" == typeof match) var ok = ch == match;
                else var ok = ch && (match.test ? match.test(ch) : match(ch));
                if (ok) 
                {
                    ++this.pos; 
                    return ch;
                }
            },
            
            eatWhile: function(match) {
                var start = this.pos;
                while ( this.eat(match) ) {}
                return this.pos > start;
            },
            
            eatSpace: function() {
                var start = this.pos;
                while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) ++this.pos;
                return this.pos > start;
            },
            
            current: function() {
                var c = this.string.slice(this.start, this.pos);
                this.start = this.pos;
                return c;
            }
        }),
        
        parserFactory = function(grammar, LOCALS) {
            
            var parser = {
                
                getLineTokens: function() {
                    
                    var DEFAULT = LOCALS.DEFAULT,
                        Style = grammar.Style || {},
                        ERROR = Style.error || null,
                        tokens = grammar.Parser || [],
                        numTokens = tokens.length
                    ;
                    
                    return function(line, state) {
                
                        // ACE Tokenizer compatible
                        var i, token, style, stack, aceTokens = [], stream = new Stream( line );
                        
                        //console.log(state);
                        
                        state = state || {};
                        stack = state.stack = state.stack || [];
                        
                        while ( !stream.eol() )
                        {
                            if ( stream.eatSpace() ) 
                            {
                                state.current = null;
                                state.currentToken = T_DEFAULT;
                                continue;
                            }
                            
                            //stackTrace(stack);
                            
                            while ( stack.length )
                            {
                                token = stack.pop();
                                
                                /*if ( T_ACTION == token.type )
                                {
                                    console.log(token.toString());
                                    token.doAction(stream, state, LOCALS);
                                    continue;
                                }*/
                                
                                style = token.tokenize(stream, state, LOCALS);
                                
                                // match failed
                                if ( false === style )
                                {
                                    // error
                                    if ( token.ERROR || token.isRequired )
                                    {
                                        // empty the stack
                                        state.stack.length = 0;
                                        // skip this character
                                        stream.next();
                                        //console.log(["ERROR", stream.current()]);
                                        // generate error
                                        state.current = null;
                                        state.currentToken = T_ERROR;
                                        aceTokens.push( { type: ERROR, value: stream.current() } );
                                    }
                                    // optional
                                    else
                                    {
                                        continue;
                                    }
                                }
                                // found token
                                else
                                {
                                    state.current = token.tokenName;
                                    aceTokens.push( { type: style, value: stream.current() } );
                                }
                            }
                            
                            for (i=0; i<numTokens; i++)
                            {
                                token = tokens[i];
                                style = token.tokenize(stream, state, LOCALS);
                                
                                // match failed
                                if ( false === style )
                                {
                                    // error
                                    if ( token.ERROR || token.isRequired )
                                    {
                                        // empty the stack
                                        state.stack.length = 0;
                                        // skip this character
                                        stream.next();
                                        //console.log(["ERROR", stream.current()]);
                                        // generate error
                                        state.current = null;
                                        state.currentToken = T_ERROR;
                                        aceTokens.push( { type: ERROR, value: stream.current() } );
                                    }
                                    // optional
                                    else
                                    {
                                        continue;
                                    }
                                }
                                // found token
                                else
                                {
                                    state.current = token.tokenName;
                                    aceTokens.push( { type: style, value: stream.current() } );
                                }
                            }
                            
                            // unknown, bypass
                            stream.next();
                            state.current = null;
                            state.currentToken = T_DEFAULT;
                            aceTokens.push( { type: DEFAULT, value: stream.current() } );
                        }
                        
                        //console.log(aceTokens);
                        
                        // ACE Tokenizer compatible
                        return { state: state, tokens: aceTokens };
                    }
                }()
            }
            return parser;
        }
    ;
      
    var 
        parse = function(grammar) {
            var RegExpID, RegExpGroups, tokens, numTokens, _tokens, 
                Style, Lex, Syntax, t, tokenID, token, tok,
                parsedRegexes = {}, parsedMatchers = {}, parsedTokens = {};
            
            // grammar is parsed, return it
            // avoid reparsing already parsed grammars
            if ( grammar.__parsed )  return grammar;
            
            grammar = extend(grammar, defaultGrammar);
            
            RegExpID = grammar.RegExpID || null;
            grammar.RegExpID = null;
            delete grammar.RegExpID;
            
            RegExpGroups = grammar.RegExpGroups || {};
            grammar.RegExpGroups = null;
            delete grammar.RegExpGroups;
            
            Lex = grammar.Lex || {};
            grammar.Lex = null;
            delete grammar.Lex;
            
            Syntax = grammar.Syntax || {};
            grammar.Syntax = null;
            delete grammar.Syntax;
            
            Style = grammar.Style || {};
            
            _tokens = grammar.Parser || [];
            numTokens = _tokens.length;
            tokens = [];
            
            
            // build tokens
            for (t=0; t<numTokens; t++)
            {
                tokenID = _tokens[ t ];
                
                token = getTokenizer( tokenID, RegExpID, RegExpGroups, Lex, Syntax, Style, parsedRegexes, parsedMatchers, parsedTokens ) || null;
                
                if ( token )
                {
                    if ( T_ARRAY == get_type( token ) )
                        tokens = tokens.concat( token );
                    
                    else
                        tokens.push( token );
                }
            }
            
            grammar.Parser = tokens;
            grammar.Style = Style;
            
            // this grammar is parsed
            grammar.__parsed = true;
            
            return grammar;
        },
        
        //
        // default grammar settings
        defaultGrammar = {
            
            // prefix ID for regular expressions used in the grammar
            "RegExpID" : null,
            
            // lists of (simple/string) tokens to be grouped into one regular expression,
            // else matched one by one, 
            // this is usefull for speed fine-tuning the parser
            "RegExpGroups" : null,
            
            //
            // Style model
            "Style" : {
                
                // lang token type  -> ACE (style) tag
                "error":                "error"
            },

            //
            // Lexical model
            "Lex" : null,
            
            //
            // Syntax model and context-specific rules (optional)
            "Syntax" : null,
            
            // what to parse and in what order
            "Parser" : null
        }
    ;
    
    /*
    var ace_OOP_inherits = (function() {
        var createObject = Object.create || function(prototype, properties) {
            var Type = function () {};
            Type.prototype = prototype;
            object = new Type();
            object.__proto__ = prototype;
            if (typeof properties !== 'undefined' && Object.defineProperties) {
                Object.defineProperties(object, properties);
            }
        };
        return function(ctor, superCtor) {
            ctor.super_ = superCtor;
            ctor.prototype = createObject(superCtor.prototype, {
                constructor: {
                    value: ctor,
                    enumerable: false,
                    writable: true,
                    configurable: true
                }
            });
        };
    }());
    */
    
    //
    //  Ace Grammar main class
    /**[DOC_MARKDOWN]
    *
    * ###AceGrammar Methods
    *
    [/DOC_MARKDOWN]**/
    var self = {
        
        VERSION : VERSION,
        
        init : function(RegExAnalyzer) {
            RegexAnalyzer = RegExAnalyzer;
        },
        
        // extend a grammar using another base grammar
        /**[DOC_MARKDOWN]
        * __Method__: *extend*
        *
        * ```javascript
        * extendedgrammar = AceGrammar.extend(grammar, basegrammar1 [, basegrammar2, ..]);
        * ```
        *
        * Extend a grammar with basegrammar1, basegrammar2, etc..
        *
        * This way arbitrary dialects and variations can be handled more easily
        [/DOC_MARKDOWN]**/
        extend : extend,
        
        // parse a grammar
        /**[DOC_MARKDOWN]
        * __Method__: *parse*
        *
        * ```javascript
        * parsedgrammar = AceGrammar.parse(grammar);
        * ```
        *
        * This is used internally by the AceGrammar Class
        * In order to parse a JSON grammar to a form suitable to be used by the syntax-highlight parser.
        * However user can use this method to cache a parsedgrammar to be used later.
        * Already parsed grammars are NOT re-parsed when passed through the parse method again
        [/DOC_MARKDOWN]**/
        parse : parse,
        
        // get an ACE-compatible syntax-highlight mode from a grammar
        /**[DOC_MARKDOWN]
        * __Method__: *getMode*
        *
        * ```javascript
        * mode = AceGrammar.getMode(grammar, [, DEFAULT]);
        * ```
        *
        * This is the main method which transforms a JSON grammar into an ACE syntax-highlight parser.
        * DEFAULT is the default return value (null by default) for things that are skipped or not styled
        * In general there is no need to set this value, unlees you need to return something else
        [/DOC_MARKDOWN]**/
        getMode : function(grammar, DEFAULT) {
            
            // build the grammar
            grammar = parse( grammar );
            
            //console.log(grammar);
            
            var 
                LOCALS = { 
                    // default return code, when no match or empty found
                    // 'null' should be used in most cases
                    DEFAULT: DEFAULT || "invisible"
                },
                parser, aceMode
            ;
            
            // generate parser with token factories (grammar, LOCALS are available locally by closures)
            parser = parserFactory( grammar, LOCALS );
            
            aceMode = {
                
                // the custom Parser/Tokenizer
                getTokenizer : function(){
                    return function() { 
                        return parser;
                    };
                }(),
                

                /*
                *   Maybe needed in later versions..
                */
                
                HighlightRules : null, //TextHighlightRules;
                $behaviour : null, //new Behaviour();

                lineCommentStart : "",
                blockComment : "",

                toggleCommentLines : function(state, session, startRow, endRow) {
                    return false;
                },

                toggleBlockComment : function(state, session, range, cursor) {
                },

                getNextLineIndent : function(state, line, tab) {
                    return line.match(/^\s*/)[0];
                },

                checkOutdent : function(state, line, input) {
                    return false;
                },

                autoOutdent : function(state, doc, row) {
                },

                $getIndent : function(line) {
                    return line.match(/^\s*/)[0];
                },

                createWorker : function(session) {
                    return null;
                },

                createModeDelegates : function (mapping) {
                },

                $delegator : function(method, args, defaultHandler) {
                },

                transformAction : function(state, action, editor, session, param) {
                },
                
                getKeywords : function( append ) {
                    return [];
                },
                
                $createKeywordList : function() {
                    return [];
                },

                getCompletions : function(state, session, pos, prefix) {
                    return [];
                }
                
            };
            
            // ACE Mode compatible
            return aceMode;
        }
    };
    
    // export it
    if ('undefined' != typeof (module) && module.exports)  module.exports = self;
    
    else if ('undefined' != typeof (exports)) exports = self;
    
    else this.AceGrammar = self;

    
}).call(this);