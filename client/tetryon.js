/**
 * Tetryon - An open-source UTM tracker and metrics engine.
 */

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

    if( document.location.protocol === "https:" ) {
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
  this.__identifierKey = this.__keyPrefix + 'Identifier';
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
 * Get the identifier currently tied to this client.
 * If one doesn't exist, it returns the BeamID by default.
 * @return {String}
 */
Tetryon.prototype._getIdentifier = function () {
  if( docCookies.hasItem(this.__identifierKey) ) {
    return docCookies.getItem(this.__identifierKey);
  }

  return this._getBeamId();
}

/**
 * Set the identifier for this client.
 * Returns the identifier as a result.
 * @param {String} identifier
 * @return {String}
 */
Tetryon.prototype._setIdentifier = function (identifier) {
  if( ! docCookies.setItem(this.__identifierKey, identifier, Infinity) ) {
    return this._getBeamId();
  }

  return this._getIdentifier();
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

Tetryon.prototype._getDeviceData = function () {
  var data = {};

  data['device'] = "unknown";
  if( device.mobile() ) {
    data['device'] = "phone";
  } else if( device.tablet() ) {
    data['device'] = "tablet";
  } else if( device.desktop() ) {
    data['device'] = "desktop";
  }

  return data;
}

/**
 * Send a request with the attached data.
 * @param  {Object} data 
 */
Tetryon.prototype._sendRequest = function (type, data, callback) {
  if( typeof callback === 'undefined' ) {
    callback = function() {};
  }

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
    requestImages[i].onload = callback;
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
Tetryon.prototype.createVisitParticle = function (params, callback) {
  if( typeof callback === 'undefined' ) {
    callback = function() {};
  }

  var data = this._mergeDataObjects({}, params);

  data = this._mergeDataObjects(data, this._getDeviceData());
  data = this._mergeDataObjects(data, this._getUtmData());
  
  // Specific to, and automatically added for, visit events.
  data['referrer'] = document.referrer;
  
  // Reserved Values
  data[this.__keyPrefix + 'Event'] = "visit";
  data[this.__keyPrefix + 'Domain'] = document.location.host;
  data[this.__keyPrefix + 'Path'] = document.location.pathname;
  
  return this._sendRequest('particle', data, callback);
}

/**
 * Send an arbitrary particle for this beam.
 * @param  {String} event  The keyword for this event type, i.e. "checkout" or "visit"
 * @param  {Object} params Key/Value string pairs to be sent as a payload.
 * @return {Boolean} 
 */
Tetryon.prototype.createParticle = function (event, params, callback) {
  if( typeof callback === 'undefined' ) {
    callback = function() {};
  }

  var data = this._mergeDataObjects({}, params);

  // Reserved Values
  data[this.__keyPrefix + 'Event'] = "visit";
  data[this.__keyPrefix + 'Domain'] = document.location.host;
  data[this.__keyPrefix + 'Path'] = document.location.pathname;

  return this._sendRequest('particle', data, callback);
}

/**
 * Send an internal ID to be applied to the beam for record lookup and association.
 * @param  {String} identifier The internal ID ( or string, email address, etc. ) to reference this beam.
 * @param  {Object} params     Additional information you want stored on the beam.
 * @return {Boolean}
 */
Tetryon.prototype.identifyBeam = function (identifier, callback) {
  if( typeof callback === 'undefined' ) {
    callback = function() {};
  }

  if( this._getIdentifier() == identifier ) {
    return callback();
  }

  var data = {};

  data[this.__identifierKey] = this._setIdentifier(identifier);

  return this._sendRequest('beam', data, callback);
}

/*
  :: cookies.js ::

  A complete cookies reader/writer framework with full unicode support.

  Revision #1 - September 4, 2014

  https://developer.mozilla.org/en-US/docs/Web/API/document.cookie
  https://developer.mozilla.org/User:fusionchess

  This framework is released under the GNU Public License, version 3 or later.
  http://www.gnu.org/licenses/gpl-3.0-standalone.html

  Syntaxes:

  * docCookies.setItem(name, value[, end[, path[, domain[, secure]]]])
  * docCookies.getItem(name)
  * docCookies.removeItem(name[, path[, domain]])
  * docCookies.hasItem(name)
  * docCookies.keys()
*/

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

/*
Copyright (c) 2014 Matthew Hudson

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/

(function() {
  var previousDevice, _addClass, _doc_element, _find, _handleOrientation, _hasClass, _orientation_event, _removeClass, _supports_orientation, _user_agent;

  previousDevice = window.device;

  window.device = {};

  _doc_element = window.document.documentElement;

  _user_agent = window.navigator.userAgent.toLowerCase();

  device.ios = function() {
    return device.iphone() || device.ipod() || device.ipad();
  };

  device.iphone = function() {
    return _find('iphone');
  };

  device.ipod = function() {
    return _find('ipod');
  };

  device.ipad = function() {
    return _find('ipad');
  };

  device.android = function() {
    return _find('android');
  };

  device.androidPhone = function() {
    return device.android() && _find('mobile');
  };

  device.androidTablet = function() {
    return device.android() && !_find('mobile');
  };

  device.blackberry = function() {
    return _find('blackberry') || _find('bb10') || _find('rim');
  };

  device.blackberryPhone = function() {
    return device.blackberry() && !_find('tablet');
  };

  device.blackberryTablet = function() {
    return device.blackberry() && _find('tablet');
  };

  device.windows = function() {
    return _find('windows');
  };

  device.windowsPhone = function() {
    return device.windows() && _find('phone');
  };

  device.windowsTablet = function() {
    return device.windows() && (_find('touch') && !device.windowsPhone());
  };

  device.fxos = function() {
    return (_find('(mobile;') || _find('(tablet;')) && _find('; rv:');
  };

  device.fxosPhone = function() {
    return device.fxos() && _find('mobile');
  };

  device.fxosTablet = function() {
    return device.fxos() && _find('tablet');
  };

  device.meego = function() {
    return _find('meego');
  };

  device.cordova = function() {
    return window.cordova && location.protocol === 'file:';
  };

  device.nodeWebkit = function() {
    return typeof window.process === 'object';
  };

  device.mobile = function() {
    return device.androidPhone() || device.iphone() || device.ipod() || device.windowsPhone() || device.blackberryPhone() || device.fxosPhone() || device.meego();
  };

  device.tablet = function() {
    return device.ipad() || device.androidTablet() || device.blackberryTablet() || device.windowsTablet() || device.fxosTablet();
  };

  device.desktop = function() {
    return !device.tablet() && !device.mobile();
  };

  device.portrait = function() {
    return (window.innerHeight / window.innerWidth) > 1;
  };

  device.landscape = function() {
    return (window.innerHeight / window.innerWidth) < 1;
  };

  device.noConflict = function() {
    window.device = previousDevice;
    return this;
  };

  _find = function(needle) {
    return _user_agent.indexOf(needle) !== -1;
  };

  _hasClass = function(class_name) {
    var regex;
    regex = new RegExp(class_name, 'i');
    return _doc_element.className.match(regex);
  };

  _addClass = function(class_name) {
    if (!_hasClass(class_name)) {
      return _doc_element.className += " " + class_name;
    }
  };

  _removeClass = function(class_name) {
    if (_hasClass(class_name)) {
      return _doc_element.className = _doc_element.className.replace(class_name, "");
    }
  };

  if (device.ios()) {
    if (device.ipad()) {
      _addClass("ios ipad tablet");
    } else if (device.iphone()) {
      _addClass("ios iphone mobile");
    } else if (device.ipod()) {
      _addClass("ios ipod mobile");
    }
  } else if (device.android()) {
    if (device.androidTablet()) {
      _addClass("android tablet");
    } else {
      _addClass("android mobile");
    }
  } else if (device.blackberry()) {
    if (device.blackberryTablet()) {
      _addClass("blackberry tablet");
    } else {
      _addClass("blackberry mobile");
    }
  } else if (device.windows()) {
    if (device.windowsTablet()) {
      _addClass("windows tablet");
    } else if (device.windowsPhone()) {
      _addClass("windows mobile");
    } else {
      _addClass("desktop");
    }
  } else if (device.fxos()) {
    if (device.fxosTablet()) {
      _addClass("fxos tablet");
    } else {
      _addClass("fxos mobile");
    }
  } else if (device.meego()) {
    _addClass("meego mobile");
  } else if (device.nodeWebkit()) {
    _addClass("node-webkit");
  } else {
    _addClass("desktop");
  }

  if (device.cordova()) {
    _addClass("cordova");
  }

  _handleOrientation = function() {
    if (device.landscape()) {
      _removeClass("portrait");
      return _addClass("landscape");
    } else {
      _removeClass("landscape");
      return _addClass("portrait");
    }
  };

  _supports_orientation = "onorientationchange" in window;

  _orientation_event = _supports_orientation ? "orientationchange" : "resize";

  if (window.addEventListener) {
    window.addEventListener(_orientation_event, _handleOrientation, false);
  } else if (window.attachEvent) {
    window.attachEvent(_orientation_event, _handleOrientation);
  } else {
    window[_orientation_event] = _handleOrientation;
  }

  _handleOrientation();

}).call(this);
