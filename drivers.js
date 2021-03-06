var fs = require('fs');
var path = require('path');
var util = require('util');

var async = require('async');
require('colors');

var log = require('./log.js');


var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;
var REQUIRED_METHODS = {
    getInfo: ['callback'],
    verifyOptions: ['opts', 'callback'],
    getTargetStats: ['env', 'callback'],
    getSourceStats: ['env', 'callback'],
    getMeta: ['env', 'callback'],
    putMeta: ['env', 'metadata', 'callback'],
    getData: ['env', 'callback'],
    putData: ['env', 'docs', 'callback'],
    reset: ['env', 'callback']
};

/**
 * Map with all the drivers info:
 * {
 *   driverId: {
 *      info: <info object supplied by driver>,
 *      options: <options object supplied by driver>,
 *      driver: <driver implementation>
 *   }
 * }
 * @type {{}}
 */
exports.drivers = {};

exports.params = {
    /**
     *  Returns an array of al the parameters a function has defined.
     *
     * @param func
     * @returns {string[]}
     */
    get: function (func) {
        var fnStr = func.toString().replace(STRIP_COMMENTS, '');
        var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
        if (result === null) {
            result = [];
        }
        return result;
    },
    /**
     * Checks if the given method has all the required parameters to properly work using the REQUIRED_METHODS
     * definition.
     *
     * @param func
     * @param b
     * @returns {boolean}
     */
    verify: function (func, b) {
        var a = this.get(func);
        if (a === b) {
            return true;
        }
        for (var i in b) {
            if (a[i] != b[i]) {
                return false;
            }
        }
        return true;
    }
};

/**
 * Check sif a driver implements all the necessary methods with enough parameters defined to work properly.
 *
 * @param driver
 * @returns {boolean}
 */
exports.verify = function (driver) {
    var requiredMethods = util._extend({}, REQUIRED_METHODS);
    for (var property in driver) {
        if (typeof driver[property] == "function" && requiredMethods[property]) {
            if (exports.params.verify(driver[property], requiredMethods[property])) {
                delete requiredMethods[property];
            } else {
                log.error("The selected driver has invalid parameters %j on function %s: %j", requiredMethods[property], property, exports.params.get(driver[property]));
            }
        }
    }
    if (!Object.keys(requiredMethods).length) {
        return true;
    }
    for (var missingMethod in requiredMethods) {
        log.error("The selected driver is missing a required function: %s", missingMethod);
    }
    return false;
};

/**
 * Add a driver to the list of known drivers.
 *
 * @param driver
 * @param callback
 */
exports.register = function (driver, callback) {
    if (!exports.verify(driver)) {
        log.die(10);
    }

    driver.getInfo(function (err, info, options) {
        if (exports.drivers[info.id]) {
            log.die(10, 'The same driver is being added twice: ' + info.id);
        }
        exports.drivers[info.id] = {
            info: info,
            options: options,
            driver: driver,
            threadsafe: info.threadsafe === true
        };
        log.debug("Successfully loaded [%s] version: %s", info.name, info.version);
        callback();
    });
};

/**
 * Search a directory for drivers. To keep things simple drivers need to end with .driver.js
 *
 * @param dir
 * @param callback
 */
exports.find = function (dir, callback) {
    try {
        if(dir.indexOf('/') !== 0) {
            dir = path.join(__dirname, dir);
        }
        var files = fs.readdirSync(dir);
        async.each(files, function (file, callback) {
            if (file.indexOf(".driver.js") > -1) {
                exports.register(require(dir + '/' + file), callback);
            }
            else {
                callback();
            }
        }, callback);
    } catch (e) {
        log.debug("There was an error loading drivers from %s", dir);
        callback();
    }
};

/**
 * Returns a driver for the given ID.
 *
 * @param id
 * @returns {*}
 */
exports.get = function(id) {
    if (!exports.drivers[id]) {
        log.error("Tried to load driver [%s] that doesnt exist!", id);
        log.die(11);
    }
    return exports.drivers[id];
};

/**
 * Prints a list of all registered drivers with extended information.
 */
exports.describe = function(detailed) {
    function pad(str, len) {
        while(str.length < len) {
            str += ' ';
        }
        return str;
    }

    var idLen = 2, verLen = 7, nameLen = 4;
    for (var i in exports.drivers) {
        var d = exports.drivers[i].info;
        idLen = Math.max(idLen, d.id.length);
        verLen = Math.max(verLen, d.version.length);
        nameLen = Math.max(nameLen, d.name.length);
    }

    console.log(idLen, nameLen, verLen);

    if (detailed) {
        console.log(pad("ID".underline, idLen + 13) +
        pad("Name".underline, nameLen + 11) +
        pad("Version".underline, verLen + 11).grey +
        "Description".grey.underline);
    } else {
        console.log(pad("ID".underline, idLen + 13) +
        "Name".underline);
    }

    var driverList = [];
    for (var j in exports.drivers) {
        driverList.push(exports.drivers[j].info);
    }
    driverList.sort(function(a, b) {
        return a.id.localeCompare(b.id);
    });

    for (var k in driverList) {
        var driver = driverList[k];
        if (detailed) {
            console.log(pad("[" + driver.id.blue + "]", idLen + 14) +
            pad(driver.name, nameLen + 2) +
            pad(driver.version, verLen + 2).grey +
            driver.desciption.grey);
        } else {
            console.log(pad("[" + driver.id.blue + "]", idLen + 14) + driver.name);
        }
    }
};