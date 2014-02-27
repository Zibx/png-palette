var BASE64_MARKER = ';base64,';

var crcTableCache;
var makeCRCTable = function() {
    var c;
    var crcTable = [];
    for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }

    return crcTableCache = crcTable;
};

var crc32_gp = function(str) {
    var crcTable = crcTableCache || (makeCRCTable());
    var crc = 0 ^ (-1);

    for (var i = 0; i < str.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }

    return (crc ^ (-1)) >>> 0;
};

(function(){
    var slice = Array.prototype.slice,
        toString = Object.prototype.toString,
        fromCharCode = String.fromCharCode,
        apply = function( a, b ){
            for( var i in b )
                if( b.hasOwnProperty( i ) )
                    a[ i ] = b[ i ];
            return a;
        },
        BASE64_MARKER = ';base64,',
        crc = function( string ){
            var crc = crc32_gp( string );
            crc = fromCharCode( crc >>> 24 & 255 ) +
                fromCharCode( crc >>> 16 & 255 ) +
                fromCharCode( crc >>> 8 & 255 ) +
                fromCharCode( crc & 255 );
            return crc;
        },
        arrayToBinary = function( arr ){
            var out = '', i, _i;
            for( i = 0, _i = arr.length; i < _i; i++ )
                out+= fromCharCode( arr[ i ] );
            return out;
        },
        binaryToArray = function( string ){
            var out, i, _i = string.length;
            out = new Array( _i ); // initializing length is faster than create items (jsperf)
            for( i = 0, _i; i < _i; i++ )
                out[ i ] = string.charCodeAt( i );
            return out;
        },
        toTwoHex = function( number ){
            var hex = number.toString( 16 );
            return hex.length < 2 ? '0' + hex : hex;
        },
        Chunk = function( _modifiedChunks ){
            this._modifiedChunks = _modifiedChunks;
        },
        zPngology = function(){};
    Chunk.prototype = {
        set: function( n ){
            var blockSize = arguments.length - 1,
                offset = n * blockSize, i,
                oldVal, newVal;
            for( i = 1; i <= blockSize; i++ ){
                oldVal = this.data[ offset ];
                newVal = arguments[ i ];
                if( oldVal !== newVal ){
                    this.data[ offset ] = newVal;
                    this._modifiedChunks[ this.name ] = true;
                }
                offset++;
            }
        },
        _rawUpdate: function(  ){
            var chunkNameAndData = this.name + arrayToBinary( this.data ); // may be optimized, we don't have to do it with unmodified data
            return this.rawData = this.rawLength + chunkNameAndData + crc( chunkNameAndData );
        }
    };
    zPngology.prototype = {
        ctor: function( cfg ){

            if( typeof cfg === 'string' ){
                // JUST MODIFY BASE64 DATA
                this.TYPE = 'text';
                this.base64 = cfg;
                this.update = this.getBase64;
            }else if(
                    toString.call(cfg) === '[object HTMLImageElement]' ||
                    (cfg.tagName && cfg.tagName === 'IMG')
                ){
                // IMAGE CASE
                this.TYPE = 'object';
                this.update = this._imageUpdate;
                this.el = cfg;
                this.base64 = cfg.src;
            }else if( typeof cfg === 'object' ){
                apply( this, cfg );
                return this.ctor( cfg.data || cfg.image || cfg.obj || cfg.el );
            }else{
                throw 'incorrect argument for zPngology';
            }
            this._initChunks();
            return this;
        },
        // update image
        _imageUpdate: function(  ){
            this.el.src = this.getBase64();
            return this;
        },
        _getLength: function( string ){
            var length = binaryToArray( string );
            return length[ 3 ] +
                length[ 2 ] * 256 +
                length[ 1 ] * 65536 +
                length[ 0 ] * 16777216;
        },
        _initChunks: function(  ){

            var base64Prefix = this.base64Prefix = this.base64.substr( 0, this.base64.indexOf( BASE64_MARKER ) + BASE64_MARKER.length),
                rawData = this.rawData = atob( this.base64.substr( base64Prefix.length ) ),
                data = rawData.substr( 8 ),
                chunks = this.chunks = {},
                chunk,
                chunkLength,
                _modifiedChunks = this._modifiedChunks = {},
                interactiveChunks = { PLTE: true, tRNS: true },
                _chunkOrder = this._chunkOrder = [];

            this.prefix = rawData.substr( 0, 8 );

            while( data.length ){
                chunk = new Chunk( _modifiedChunks );
                chunkLength = this._getLength( chunk.rawLength = data.substr( 0, 4 ) );
                chunk.length = chunkLength;
                chunk.name = data.substr( 4, 4 );
                _chunkOrder.push( chunk );
                chunk.rawData = data.substr( 0, chunkLength + 12 );

                if( interactiveChunks[ chunk.name ] )
                    chunk.data = binaryToArray( chunk.rawData.substr(8, chunkLength) );

                chunks[ chunk.name ] = chunk;
                data = data.substr( chunk.rawData.length );
            }
            this._initOriginalColors();
        },
        _initOriginalColors: function(  ){
            this.originalColors = {};
            var data = this.chunks.PLTE.data,
                number = 0,
                i, _i, tmp;
            for( i = 0, _i = data.length; i < _i; i += 3 ){

                this.originalColors[
                    toTwoHex( data[ i ] ) +
                    toTwoHex( data[ i + 1 ] ) +
                    toTwoHex( data[ i + 2 ] )
                ] = number;
                number++;
            }

        },
        _base64Update: function(  ){
            var chunks = this.chunks,
                _modifiedChunks = this._modifiedChunks,
                chunk, i, _i,
                data = this.prefix || '',
                _chunkOrder = this._chunkOrder;
            for( i = 0, _i = _chunkOrder.length; i < _i; i++ ){
                chunk = _chunkOrder[ i ];
                if( _modifiedChunks[ chunk.name ] ){
                    data += chunk._rawUpdate();
                    delete _modifiedChunks[ chunk.name ];
                }else
                    data += chunk.rawData;
            }
            return this.base64 = this.base64Prefix + btoa( data );
        },
        getBase64: function(  ){
            this._base64Update();
            return this.base64;
        },
        parseColor: function( color, alpha ){
            if( typeof color === 'string' ){
                var tmp;
                if( color.charAt(0) === '#' )
                    color = color.substr( 1 );

                return color.length === 3 ?
                        [
                            parseInt( ( tmp = color.charAt(0) ) + tmp, 16 ),
                            parseInt( ( tmp = color.charAt(1) ) + tmp, 16 ),
                            parseInt( ( tmp = color.charAt(2) ) + tmp, 16 ),
                            alpha
                        ]
                        :
                        [
                            parseInt( color.substr( 0, 2 ), 16 ),
                            parseInt( color.substr( 2, 2 ), 16 ),
                            parseInt( color.substr( 4, 2 ), 16 ),
                            alpha
                        ];
            }
        },
        setColorHex: function( number, color, alpha ){
            return this.setColor(
                number,
                this.parseColor( color, alpha )
            );
        },
        numberFromColor: function(  ){

        },
        getColor: function( number ){
            var PLTE = this.chunks.PLTE.data,
                tRNS = (this.chunks.tRNS || {data:[]}).data,
                offset = number * 3;

            return [
                PLTE[ offset ],
                PLTE[ offset + 1 ],
                PLTE[ offset + 2 ],
                tRNS[ number ]
            ];
        },
        setOriginalColor: function( originalColor, color, hex, alpha ){

            if( originalColor.charAt(0) === '#' )
                originalColor = originalColor.substr( 1 );

            var number = this.originalColors[ originalColor ];
            number !== void 0 && ( hex ? this.setColorHex( number, color, alpha ) : this.setColor( number, color ) );
            return this;
        },
        setOriginalColorHex: function( originalColor, color, alpha ){
            return this.setOriginalColor( originalColor, color, true, alpha )
        },
        setColor: function( number, color ){
            this.chunks.PLTE.set( number, color[ 0 ], color[ 1 ], color[ 2 ] );
            color[ 3 ] !== void 0 && this.chunks.tRNS.set( number, color[ 3 ] );
            return this;
        }
    };
    // Factory
    window.Pngology = function(){
        var obj = new zPngology();
        obj.ctor.apply(obj, slice.call(arguments));
        return obj;
    };
})();