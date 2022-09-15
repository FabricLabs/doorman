## Classes

<dl>
<dt><a href="#Doorman">Doorman</a></dt>
<dd><p>General-purpose bot framework.</p>
</dd>
<dt><a href="#Plugin">Plugin</a></dt>
<dd><p>Plugins are the developer-facing component of Doorman.  Used to configure
behavior by consumers, developers can rely on the Plugin prototype to provide
basic functionality needed by an instanced plugin.</p>
</dd>
<dt><a href="#Router">Router</a> ⇐ <code>Fabric.Scribe</code></dt>
<dd><p>Process incoming messages.</p>
</dd>
<dt><a href="#Service">Service</a></dt>
<dd></dd>
</dl>

<a name="Doorman"></a>

## Doorman
General-purpose bot framework.

**Kind**: global class  

* [Doorman](#Doorman)
    * [new Doorman(config)](#new_Doorman_new)
    * [.parse(msg)](#Doorman+parse)
    * [.start()](#Doorman+start) ⇒ [<code>Doorman</code>](#Doorman)
    * [.stop()](#Doorman+stop) ⇒ [<code>Doorman</code>](#Doorman)
    * [.use(plugin)](#Doorman+use) ⇒ [<code>Doorman</code>](#Doorman)
    * [._defineTrigger(handler)](#Doorman+_defineTrigger) ⇒ [<code>Doorman</code>](#Doorman)

<a name="new_Doorman_new"></a>

### new Doorman(config)
Construct a Doorman.


| Param | Type | Description |
| --- | --- | --- |
| config | <code>Object</code> | Configuration. |
| config.path | <code>Object</code> | Local path for [Store](Store). |
| config.services | <code>Array</code> | List of services to enable. |
| config.trigger | <code>String</code> | Prefix to use as a trigger. |

<a name="Doorman+parse"></a>

### doorman.parse(msg)
Look for triggers in a message.

**Kind**: instance method of [<code>Doorman</code>](#Doorman)  

| Param | Type | Description |
| --- | --- | --- |
| msg | <code>Message</code> | Message to evaluate. |

<a name="Doorman+start"></a>

### doorman.start() ⇒ [<code>Doorman</code>](#Doorman)
Activates a Doorman instance.

**Kind**: instance method of [<code>Doorman</code>](#Doorman)  
**Returns**: [<code>Doorman</code>](#Doorman) - Chainable method.  
<a name="Doorman+stop"></a>

### doorman.stop() ⇒ [<code>Doorman</code>](#Doorman)
Halt a Doorman instance.

**Kind**: instance method of [<code>Doorman</code>](#Doorman)  
**Returns**: [<code>Doorman</code>](#Doorman) - Chainable method.  
<a name="Doorman+use"></a>

### doorman.use(plugin) ⇒ [<code>Doorman</code>](#Doorman)
Configure Doorman to use a Plugin.

**Kind**: instance method of [<code>Doorman</code>](#Doorman)  
**Returns**: [<code>Doorman</code>](#Doorman) - Chainable method.  

| Param | Type | Description |
| --- | --- | --- |
| plugin | <code>Mixed</code> | Can be of type Map (trigger name => behavior) or Plugin (constructor function). |

<a name="Doorman+_defineTrigger"></a>

### doorman.\_defineTrigger(handler) ⇒ [<code>Doorman</code>](#Doorman)
Register a Trigger.

**Kind**: instance method of [<code>Doorman</code>](#Doorman)  
**Returns**: [<code>Doorman</code>](#Doorman) - Instance of Doorman configured to handle Trigger.  

| Param | Type | Description |
| --- | --- | --- |
| handler | <code>Trigger</code> | Trigger to handle. |

<a name="Plugin"></a>

## Plugin
Plugins are the developer-facing component of Doorman.  Used to configure
behavior by consumers, developers can rely on the Plugin prototype to provide
basic functionality needed by an instanced plugin.

**Kind**: global class  

* [Plugin](#Plugin)
    * [new Plugin(config)](#new_Plugin_new)
    * _instance_
        * [.route(request)](#Plugin+route) ⇒ [<code>Plugin</code>](#Plugin)
        * [.subscribe(channel)](#Plugin+subscribe) ⇒ [<code>Plugin</code>](#Plugin)
    * _static_
        * [.fromName(name)](#Plugin.fromName) ⇒ <code>Mixed</code>

<a name="new_Plugin_new"></a>

### new Plugin(config)
Create an instance of a plugin.


| Param | Type | Description |
| --- | --- | --- |
| config | <code>Object</code> | Configuration to be passed to plugin. |

<a name="Plugin+route"></a>

### plugin.route(request) ⇒ [<code>Plugin</code>](#Plugin)
Route a request to its appropriate handler.

**Kind**: instance method of [<code>Plugin</code>](#Plugin)  
**Returns**: [<code>Plugin</code>](#Plugin) - Chainable method.  

| Param | Type | Description |
| --- | --- | --- |
| request | <code>Mixed</code> | Temporarily mixed type. |

<a name="Plugin+subscribe"></a>

### plugin.subscribe(channel) ⇒ [<code>Plugin</code>](#Plugin)
Attach the router to a particular message channel.

**Kind**: instance method of [<code>Plugin</code>](#Plugin)  
**Returns**: [<code>Plugin</code>](#Plugin) - Chainable method.  

| Param | Type | Description |
| --- | --- | --- |
| channel | <code>String</code> | Name of channel. |

<a name="Plugin.fromName"></a>

### Plugin.fromName(name) ⇒ <code>Mixed</code>
Static method for loading a plugin from disk.

**Kind**: static method of [<code>Plugin</code>](#Plugin)  
**Returns**: <code>Mixed</code> - Loaded plugin, or `null`.  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>String</code> | Name of the plugin to load. |

<a name="Router"></a>

## Router ⇐ <code>Fabric.Scribe</code>
Process incoming messages.

**Kind**: global class  
**Extends**: <code>Fabric.Scribe</code>  

* [Router](#Router) ⇐ <code>Fabric.Scribe</code>
    * [new Router(map)](#new_Router_new)
    * [.route(msg)](#Router+route) ⇒ <code>Array</code>
    * [.use(plugin, name)](#Router+use) ⇒ [<code>Router</code>](#Router)

<a name="new_Router_new"></a>

### new Router(map)
Maintains a list of triggers ("commands") and their behaviors.


| Param | Type | Description |
| --- | --- | --- |
| map | <code>Object</code> | Map of command names => behaviors. |

<a name="Router+route"></a>

### router.route(msg) ⇒ <code>Array</code>
Assembles a list of possible responses to the incoming request.

**Kind**: instance method of [<code>Router</code>](#Router)  
**Returns**: <code>Array</code> - List of outputs generated from the input string.  

| Param | Type | Description |
| --- | --- | --- |
| msg | <code>String</code> | Input message to route. |

<a name="Router+use"></a>

### router.use(plugin, name) ⇒ [<code>Router</code>](#Router)
Attaches a new handler to the router.

**Kind**: instance method of [<code>Router</code>](#Router)  
**Returns**: [<code>Router</code>](#Router) - Configured instance of the router.  

| Param | Type | Description |
| --- | --- | --- |
| plugin | [<code>Plugin</code>](#Plugin) | Instance of the plugin. |
| name | <code>Plugin.name</code> | Name of the plugin. |

<a name="Service"></a>

## Service
**Kind**: global class  
**Properties**

| Name | Description |
| --- | --- |
| map | The "map" is a hashtable of "key" => "value" pairs. |


* [Service](#Service)
    * [new Service(config)](#new_Service_new)
    * [.handler(message)](#Service+handler) ⇒ [<code>Service</code>](#Service)
    * [.send(channel, message)](#Service+send) ⇒ [<code>Service</code>](#Service)

<a name="new_Service_new"></a>

### new Service(config)
Basic API for connecting Doorman to a new service provider.


| Param | Type | Description |
| --- | --- | --- |
| config | <code>Object</code> | Configuration for this service. |

<a name="Service+handler"></a>

### service.handler(message) ⇒ [<code>Service</code>](#Service)
Default route handler for an incoming message.  Follows the Activity Streams
2.0 spec: https://www.w3.org/TR/activitystreams-core/

**Kind**: instance method of [<code>Service</code>](#Service)  
**Returns**: [<code>Service</code>](#Service) - Chainable method.  

| Param | Type | Description |
| --- | --- | --- |
| message | <code>Object</code> | Message object. |

<a name="Service+send"></a>

### service.send(channel, message) ⇒ [<code>Service</code>](#Service)
Send a message to a channel.

**Kind**: instance method of [<code>Service</code>](#Service)  
**Returns**: [<code>Service</code>](#Service) - Chainable method.  

| Param | Type | Description |
| --- | --- | --- |
| channel | <code>String</code> | Channel name to which the message will be sent. |
| message | <code>String</code> | Content of the message to send. |

