(function (global) {
  'use strict'
  if (!global.ReactDOM) throw new Error('ReactDOM must be loaded before ReactCreateRoot.')
  if (!global.ReactDOM.createRoot) {
    global.ReactDOM.createRoot = function (container) {
      return {
        render: function (element) {
          global.ReactDOM.render(element, container)
        },
      }
    }
  }
  if (!global.React) throw new Error('React must be loaded before ReactJSXRuntime.')
  if (global.React.jsx && global.React.jsxs) return
  var REACT_ELEMENT_TYPE = Symbol.for('react.element')
  var hasOwnProperty = Object.prototype.hasOwnProperty
  var RESERVED_PROPS = { key: true, ref: true, __self: true, __source: true }
  var ReactCurrentOwner = global.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner
  function createReactElement(type, config, maybeKey) {
    var props = {}
    var key = null
    var ref = null
    if (maybeKey !== undefined) key = String(maybeKey)
    if (config.key !== undefined) key = String(config.key)
    if (config.ref !== undefined) ref = config.ref
    for (var propName in config) {
      if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
        props[propName] = config[propName]
      }
    }
    if (type && type.defaultProps) {
      var defaultProps = type.defaultProps
      for (var name in defaultProps) {
        if (props[name] === undefined) props[name] = defaultProps[name]
      }
    }
    return {
      $$typeof: REACT_ELEMENT_TYPE,
      type: type,
      key: key,
      ref: ref,
      props: props,
      _owner: ReactCurrentOwner.current,
    }
  }
  global.React.jsx = createReactElement
  global.React.jsxs = createReactElement
})(this)
