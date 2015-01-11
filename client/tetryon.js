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

var Tetryon = function (config) {
  this._config = config;

  this._serverUrl = this._config.serverUrl
                     ? this._config.serverUrl
                     : null;

  if( this._serverUrl !== null ) {

    if( this._serverUrl.substr(this._serverUrl.length - 1) !== '/' ) {
      this._serverUrl += '/';
    }

    if( this._serverUrl.indexOf('://') >= 0 ) {
      this._serverUrl = '//' + this._serverUrl.substr(this._serverUrl.indexOf('://') + 3);
    }

  }

  this.__keyPrefix = '_ttyn';
  this.__beamIdKey = this.__keyPrefix + 'Beam';

  this.__particleEndpoint = 'particle';
  this.__beamEndpoint = 'beam';
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
  if( docCookies.hasItem(this.__beamIdKey) ) {
    return docCookies.getItem(this.__beamIdKey);
  }

  var beamId = this._generateBeamId();

  if( ! docCookies.setItem(this.__beamIdKey, beamId, Infinity) ) {
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

  delete data[this.__beamIdKey];
  data[this.__beamIdKey] = this._getBeamId();
  
  // NOTE - Microsoft limits us to 2083 characters for an entire URL
  // with only 2048 reserved for the querystring.
  
  for( key in data ) {
    requestUrl += '&' + encodeURIComponent(key.toString().substr(0,255)) + '=' + encodeURIComponent(data[key].toString().substr(0,255));
  }

  var requestImage = new Image();
  requestImage.src = requestUrl;
}

// Internal Request - maybe from init()?
Tetryon.prototype.sendVisitParticle = function (params) {
  var data = this._mergeDataObjects({}, params);

  data = this._mergeDataObjects(data, this._getUtmData());
  
  // Specific to, and automatically added for, visit events.
  data['referrer'] = document.referrer;
  // TODO - Device, OS, Screen Size, Window Size, etc.

  // Reserved Values
  data[this.__keyPrefix + 'Event'] = "visit";
  data[this.__keyPrefix + 'Domain'] = document.location.host;
  data[this.__keyPrefix + 'Path'] = document.location.pathname;
  
  this._sendRequest('particle', data);
}

Tetryon.prototype.sendEventParticle = function (event, params) {
  var data = this._mergeDataObjects({}, params);

  // Reserved Values
  data[this.__keyPrefix + 'Event'] = "visit";
  data[this.__keyPrefix + 'Domain'] = document.location.host;
  data[this.__keyPrefix + 'Path'] = document.location.pathname;

  this._sendRequest('particle', data);
}


Tetryon.prototype.sendBeamIdentifier = function (identifier, params) {
  var data = this._mergeDataObjects({}, params);

  data[this.__keyPrefix + 'Identifier'] = identifier;

  this._sendRequest('beam', data);
}

Tetryon.prototype.sendBeamInformation = function (params) {
  var data = this._mergeDataObjects({}, params);

  this._sendRequest('beam', data);
}