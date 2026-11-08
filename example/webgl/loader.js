// A minimal CommonJS loader for the compiled port.
//
// The modules of the port are compiled to CommonJS, but the example is
// loaded in a browser as a plain script, so the modules are fetched as text
// and evaluated with a tiny module system.
//
// The loader works in a browser and in Node, so it can be tested without a
// browser (`scripts/check-webgl.js`).
(function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	} else {
		root.createPonyLoader = factory();
	}
})(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	// `load(name)` returns the source of a module
	function createLoader(load) {
		const sources = {};
		const modules = {};

		function resolveName(request) {
			return request.replace(/^\.\//, '').replace(/\.js$/, '');
		}

		function requireModule(name) {
			if (modules[name]) {
				return modules[name].exports;
			}

			if (sources[name] === undefined) {
				throw new Error('The module ' + name + ' is not loaded');
			}

			const module = { exports: {} };
			modules[name] = module;

			const factory = new Function('exports', 'require', 'module', sources[name]);
			factory(module.exports, request => requireModule(resolveName(request)), module);

			return module.exports;
		}

		return {
			preload: function (names) {
				return Promise.all(names.map(async name => {
					sources[name] = await load(name);
				}));
			},
			require: requireModule,
		};
	}

	return createLoader;
});
