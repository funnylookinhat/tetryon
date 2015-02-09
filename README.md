# Tetryon

Tetryon is a fast, lightweight, cross-browser data collection tool for site 
visitors written in Go and Javascript. It's primary goal is to generate data 
( rather than report on it ) with a simple, straightforward API.  A separate 
project or tool would be the appropriate means to gather useful analytics from 
the data-points that are recorded using Tetryon.  Tetryon uses MongoDB to store 
it's data, and as such expects another service to use that database for any 
reporting.

## Overview

Every user who begins a Tetryon session on a site is given a unique ID that 
represents their **Beam**.  Beams are collections of events that represent 
unique users and devices.  Beams are made up of **Particles** - which represent 
the events and datapoints that are recorded for a specific user session.

However, Tetryon also has the ability to merge multiple beams together into a 
single **Identifier** - enabling you to group multiple sessions of the same 
user ( on separate devices or clients ) into a single, reportable index.

## Configuration

Copy the example.config.json file from config/ to config.json.  The file 
should be fairly self explanatory.

```
{
  "mongodb": {
    "hostname": "127.0.0.1",
    "username": "tetryon",
    "password": "tetryon",
    "database": "tetryon"
  },
  "http": {
    "port": "80"
  },
  "https": {
    "port": "443",
    "cert": "cert.pem",
    "key": "key.pem"
  }
}
```

Tetryon will assume that your TLS cert and key files are in the same directory 
as the config.json file.  If not, you will need to provide absolute paths for 
those values.

By default, Tetryon looks for a config file in the config/ directory next to 
the binary.  If you need to specify another path, simply run Tetryon with the 
`-configpath` parameter pointing to the directory where config.json is located.

```
tetryon -configpath="/some/absolute/path/to/config/"
```

## Usage

The easiest implementation is to append all Tetryon code to the end of your 
`<body>` section.  Future versions will support an asynchronous load and callback 
for use within the `<head>` of your page.

```html
<script type="text/javascript" src="tetryon.js"></script>
<script type="text/javascript"
var t = new Tetryon({
	'serverUrl':'tetryon.your-domain.com/',
	'serverHttpPort':'8080',
	'serverHttpsPort':'8443'
});
</script>
```

The client library will automatically will automatically handle http/https 
switching when appropriate, but it is expected that you may need to use a 
non-standard port for your server.  If so, provide them as above.  If for 
any reason you need to route requests to Tetryon through a special URI, 
simply append that to the `serverUrl` parameter:

```javascript
var t = new Tetryon({
	'serverUrl':'tetryon.your-domain.com/some/path/to/tetryon/',
});
```

**createVisitParticle** - Record a page visit.

This is a convenience method to `createParticle("visit")`, however, it will 
automatically include the page referrer ( if one exists ) along with any 
UTM information in the current URL.  It is expected that you would run this on 
every public-facing page of your site for the best data collection.  You can pass 
along any other meta information you want associated with this particle in the data 
parameter.  It accepts an object of key / value pairs.

```javascript
// Tetryon.prototype.createVisitParticle = function (params, callback)
t.createVisitParticle(
  {
    "someKey": "someValue"
  },
  function () {
    // Request complete.
  }
);
```

**createParticle** - Record any particle.

Store any arbitrary particle on a beam with any set of meta-information. These 
particles will 

```javascript
// Tetryon.prototype.createParticle = function (event, params, callback)
t.createParticle(
  "addCartProduct",
  {
    "model": "Leprechaun 5000",
    "quantity": "5"
  }
);
```

**identifyBeam** - Associate a beam to a unique identifier.

Once a user has logged in, it would make sense to identify them by some internal 
record ( either an email address or a user id ) so that you can run a report 
against the entire history of a user, rather than just their experience on a 
single device or client.

```javascript
// Tetryon.prototype.identifyBeam = function (identifier, callback)
t.identifyBeam("someUniqueIdentifier");
```