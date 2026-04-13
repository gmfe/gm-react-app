const { Compiler } = require("@rspack/core")

/** 将指定消息的warning提升为error */
class Warning2Error {
  /**
   * 
   * @param { RegExp[] } msgExps
   */
  constructor(msgExps = [/gm_api/]) {
    this.msgExps = msgExps;
  }

  /**
   * 
   * @param { Compiler } compiler 
   */
  apply(compiler) {
    compiler.hooks.done.tap(Warning2Error.name, ({ compilation }) => {
      compilation.warnings.forEach((warning) => {
        if (this.msgExps.some((exp) => exp.test(warning.message))) {
          // possible exports过于冗长，去掉
          const message = warning.message.replace(/\(possible exports.*\)/, '');
          const sourceFile = warning.module.resource
          compilation.errors.push(new Error(`${message} \n ${sourceFile}`));
        }
      });
      compilation.warnings = compilation.warnings.filter((warning) => {
        return !this.msgExps.some((exp) => exp.test(warning.message));
      });
    })
  }
}

module.exports = { Warning2Error };