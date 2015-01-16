/**
 * Tetryon - An open-source UTM tracker and metrics engine.
 */

// Thanks to Mozilla - this saves a bit of effort with UTF-8 encoded strings.
var docCookies = {
  getItem: function (sKey) {
    if (!sKey) { return null; }
    return decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
  },
  setItem: function (sKey, sValue, vEnd, sPath, sDomain, bSecure) {
    if (!sKey || /^(?:expires|max\-age|path|domain|secure)$/i.test(sKey)) { return false; }
    var sExpires = "";
    if (vEnd) {
      switch (vEnd.constructor) {
        case Number:
          sExpires = vEnd === Infinity ? "; expires=Fri, 31 Dec 9999 23:59:59 GMT" : "; max-age=" + vEnd;
          break;
        case String:
          sExpires = "; expires=" + vEnd;
          break;
        case Date:
          sExpires = "; expires=" + vEnd.toUTCString();
          break;
      }
    }
    document.cookie = encodeURIComponent(sKey) + "=" + encodeURIComponent(sValue) + sExpires + (sDomain ? "; domain=" + sDomain : "") + (sPath ? "; path=" + sPath : "") + (bSecure ? "; secure" : "");
    return true;
  },
  removeItem: function (sKey, sPath, sDomain) {
    if (!this.hasItem(sKey)) { return false; }
    document.cookie = encodeURIComponent(sKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT" + (sDomain ? "; domain=" + sDomain : "") + (sPath ? "; path=" + sPath : "");
    return true;
  },
  hasItem: function (sKey) {
    if (!sKey) { return false; }
    return (new RegExp("(?:^|;\\s*)" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=")).test(document.cookie);
  },
  keys: function () {
    var aKeys = document.cookie.replace(/((?:^|\s*;)[^\=]+)(?=;|$)|^\s*|\s*(?:\=[^;]*)?(?:\1|$)/g, "").split(/\s*(?:\=[^;]*)?;\s*/);
    for (var nLen = aKeys.length, nIdx = 0; nIdx < nLen; nIdx++) { aKeys[nIdx] = decodeURIComponent(aKeys[nIdx]); }
    return aKeys;
  }
};

/**
 * Create a Tetryon instance.
 * @param {Object} config An object with the following keys:
 * - serverUrl {String} The URL for the path to the Tetryon server.
 * - serverHttpPort {String} The port HTTP is running on.
 * - serverHttpsPort {String} The port HTTPS is running on.
 */
var Tetryon = function (config) {
  this._config = config;

  this._serverUrl = this._config.serverUrl
                  ? this._config.serverUrl
                  : null;

  this._serverHttpPort = this._config.serverHttpPort
                       ? this._config.serverHttpPort
                       : 80;

  this._serverHttpsPort = this._config.serverHttpsPort 
                        ? this._config.serverHttpsPort
                        : 443;

  if( this._serverUrl !== null ) {

    if( this._serverUrl.substr(this._serverUrl.length - 1) !== '/' ) {
      this._serverUrl += '/';
    }

    if( this._serverUrl.indexOf('://') >= 0 ) {
      this._serverUrl = this._serverUrl.substr(this._serverUrl.indexOf('://') + 3);
    }

    if( document.location.protocol === "https" ) {
      this._serverUrl = 
        "https://" +
        this._serverUrl.substr(0,this._serverUrl.indexOf('/')) + 
        ":" + this._serverHttpsPort +
        this._serverUrl.substr(this._serverUrl.indexOf('/'));
    } else {
      this._serverUrl = 
        "http://" +
        this._serverUrl.substr(0,this._serverUrl.indexOf('/')) + 
        ":" + this._serverHttpPort +
        this._serverUrl.substr(this._serverUrl.indexOf('/'));
    }

  }

  this.__keyPrefix = '_ttyn';
  this.__beamKey = this.__keyPrefix + 'Beam';
  this.__requestKey = this.__keyPrefix + 'Request';

  this.__particleEndpoint = 'particle';
  this.__beamEndpoint = 'beam';

  this.__requestCharLimit = 2000;
}

/**
 * Generate an extremely unique, 64 character ID.
 * @return {String} 
 */
Tetryon.prototype._generateBeamId = function () {
  var source = "abcdefghijklmnopqrstuvwxyz00123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  
  for( var id = ""; id.length < 52; ) {
    id += source[Math.floor(Math.random() * source.length)];
  }

  var timeSalt = Date.now().toString(36);
  for( ; timeSalt.length < 12 ; ) {
    timeSalt = '0'+timeSalt;
  }

  id = id + timeSalt;

  return id;
}

/**
 * Generate a mildly unique, 24 character ID.
 * @return {String} 
 */
Tetryon.prototype._generateRequestId = function () {
  var source = "abcdefghijklmnopqrstuvwxyz00123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for( var id = ""; id.length < 12; ) {
    id += source[Math.floor(Math.random() * source.length)];
  }

  var timeSalt = Date.now().toString(36);
  for( ; timeSalt.length < 12 ; ) {
    timeSalt = '0'+timeSalt;
  }

  id = id + timeSalt;

  return id;
}

Tetryon.prototype._encodeRequestParam = function (id, i, j) {
  return id + ':' + i + '-' + j;
} 

// Request ID for multiple requests.

/**
 * Merge two data objects and return a new object with the keys/values of each.
 * Keys in the second object will overwrite the same ones in the first.
 * @param  {Object} a 
 * @param  {Object} b 
 * @return {Object} 
 */
Tetryon.prototype._mergeDataObjects = function (a, b) {
  var data = {};

  if( a &&
      typeof a === "object" ) {
    for( i in a ) {
      if( a.hasOwnProperty(i) ) {
        data[i] = a[i];
      }
    }
  }
  
  if( b &&
      typeof b === "object" ) {
    for( i in b ) {
      if( b.hasOwnProperty(i) ) {
        data[i] = b[i];
      }
    }
  }
  
  return data;
}

/**
 * Get the unique ID for this client ( stored as a cookie )
 * If one doesn't exist, generate a new one and save it.
 * @return {String} 
 */
Tetryon.prototype._getBeamId = function () {
  if( docCookies.hasItem(this.__beamKey) ) {
    return docCookies.getItem(this.__beamKey);
  }

  var beamId = this._generateBeamId();

  if( ! docCookies.setItem(this.__beamKey, beamId, Infinity) ) {
    return false;
  }

  return beamId;
}

/**
 * Get an object containing the values of any utm parameters in the document location.
 * @return {Object} 
 */
Tetryon.prototype._getUtmData = function () {
  var data = {};

  var queryString = document.location.search;
  queryString = queryString.substring(1,queryString.length);
  
  queryParameters = queryString.split('&');
  
  for( i in queryParameters ) {
    var keyValue = queryParameters[i].split('=');
    if( keyValue[0].indexOf('utm_') == 0 ) {
      data[keyValue[0]] = keyValue[1];
    }
  }
  
  return data;
}

/**
 * Send a request with the attached data.
 * @param  {Object} data 
 */
Tetryon.prototype._sendRequest = function (type, data) {
  if( this._serverUrl === null ) {
    throw "Missing serverUrl.";
  }

  var requestUrl = this._serverUrl;

  if( type === 'particle' ) {
    requestUrl += this.__particleEndpoint;
  }
  else if( type === 'beam' ) {
    requestUrl += this.__beamEndpoint;
  }
  else {
    throw "Invalid request type: " + type;
  }

  // These are reserved keys.
  delete data[this.__beamKey];
  delete data[this.__requestKey];

  data[this.__beamKey] = this._getBeamId();

  var queryStrings = [];
  var queryStringIndex = 0;

  for( key in data ) {
    // Convert all keys and parameters to strings and trim to 255
    var tKey = key.toString().substr(0,255);
    var tData = data[key].toString().substr(0,255);

    var keyPairLength = encodeURIComponent(tKey).length + encodeURIComponent(tData).length + 2;

    if( queryStrings[queryStringIndex] && 
        ( queryStrings[queryStringIndex].length + keyPairLength ) > this.__requestCharLimit ) {
      queryStringIndex++;
    }

    if( typeof queryStrings[queryStringIndex] === "undefined" ) {
      queryStrings[queryStringIndex] = '?';
    } else {
      queryStrings[queryStringIndex] += '&';
    }

    queryStrings[queryStringIndex] += encodeURIComponent(tKey);
    
    queryStrings[queryStringIndex] += '=' + encodeURIComponent(tData);
  }

  // We add a request ID to every call so that no caching happens.
  var requestId = this._generateRequestId();

  for( var i = 0; i < queryStrings.length; i++ ) {
    var requestParam = this._encodeRequestParam(requestId, (i + 1), queryStrings.length);
    queryStrings[i] += '&' + encodeURIComponent(this.__requestKey) + '=' + encodeURIComponent(requestParam);
  }
  
  var requestImages = [];
  for( var i = 0; i < queryStrings.length; i++ ) {
    requestImages[i] = new Image();
    requestImages[i].src = requestUrl + queryStrings[i];
  }

  return true;
}

/**
 * Send a event type "visit" particle to log visiting a page.
 * This will include extra information automatically ( i.e. utm_* parameters,
 * the domain and path of the current URL, and various device information ).
 * @param  {Object} params Optional extra parameters that you may add.
 * @return {Boolean} 
 */
Tetryon.prototype.createVisit = function (params) {
  var data = this._mergeDataObjects({}, params);

  data = this._mergeDataObjects(data, this._getUtmData());
  
  // Specific to, and automatically added for, visit events.
  data['referrer'] = document.referrer;
  // TODO - Device, OS, Screen Size, Window Size, etc.

  // Reserved Values
  data[this.__keyPrefix + 'Event'] = "visit";
  data[this.__keyPrefix + 'Domain'] = document.location.host;
  data[this.__keyPrefix + 'Path'] = document.location.pathname;
  
  return this._sendRequest('particle', data);
}

/**
 * Send an arbitrary particle for this beam.
 * @param  {String} event  The keyword for this event type, i.e. "checkout" or "visit"
 * @param  {Object} params Key/Value string pairs to be sent as a payload.
 * @return {Boolean} 
 */
Tetryon.prototype.createEvent = function (event, params) {
  var data = this._mergeDataObjects({}, params);

  // Reserved Values
  data[this.__keyPrefix + 'Event'] = "visit";
  data[this.__keyPrefix + 'Domain'] = document.location.host;
  data[this.__keyPrefix + 'Path'] = document.location.pathname;

  return this._sendRequest('particle', data);
}

/**
 * Send an internal ID to be applied to the beam for record lookup and association.
 * @param  {String} identifier The internal ID ( or string, email address, etc. ) to reference this beam.
 * @param  {Object} params     Additional information you want stored on the beam.
 * @return {Boolean}
 */
Tetryon.prototype.identifyBeam = function (identifier, params) {
  var data = this._mergeDataObjects({}, params);

  data[this.__keyPrefix + 'Identifier'] = identifier;

  return this._sendRequest('beam', data);
}

/**
 * Update a beam with information.
 * @param  {Object} params     Additional information you want stored on the beam.
 * @return {Boolean}
 */
Tetryon.prototype.updateBeam = function (params) {
  var data = this._mergeDataObjects({}, params);

  return this._sendRequest('beam', data);
}