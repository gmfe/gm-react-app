const fs = require('fs')
const path = require('path')
const rspack = require('@rspack/core')
// html-rspack-plugin：兼容 html-webpack-plugin 模板语法，且适配 Rspack 子编译
// （html-webpack-plugin 在 Rspack 下会报 __webpack_modules__[moduleId] is not a function）
const HtmlWebpackPlugin = require('html-rspack-plugin')
const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin')
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin')
const paths = require('./paths')
const getClientEnvironment = require('./env')
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin')
const ReactRefreshPlugin = require('@rspack/plugin-react-refresh')
const { WebpackManifestPlugin } = require('rspack-manifest-plugin')
const { Warning2Error } = require('./warning2error_plugin')
const { pickBy } = require('lodash')

const hasTailwindConfig =
  fs.existsSync(path.join(paths.appPath, 'tailwind.config.js')) ||
  fs.existsSync(path.join(paths.appPath, 'tailwind.config.cjs'))

const createEnvironmentHash = require('./webpack/persistentCache/createEnvironmentHash')

const {
  isEnvDevelopment,
  isEnvTest,
  isEnvProduction,
  getConfig,
  packageJson,
  commonInclude,
} = require('../util')

const appConfig = getConfig()

const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false'

const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000',
)
/** 如果是用start_page启动的话，那么会赋值规则到这上面 */
const CUSTOM_AUTO_ROUTER_REG_ = process.env.CUSTOM_AUTO_ROUTER_REG_
const hasJsxRuntime = (() => {
  if (process.env.DISABLE_NEW_JSX_TRANSFORM === 'true') {
    return false
  }

  try {
    require.resolve('react/jsx-runtime')
    return true
  } catch (e) {
    return false
  }
})()

module.exports = function (webpackEnv) {
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile')

  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1))

  function getCss(options = { modules: false }) {
    const postcssPlugins = [
      hasTailwindConfig && require('tailwindcss'),
      // 强制用业务项目/根依赖的 preset-env，避免解析到 precss 自带的旧版
      require(require.resolve('postcss-preset-env', { paths: [paths.appPath] }))({
        stage: 3,
      }),
    ].filter(Boolean)

    return [
      !isEnvDevelopment && rspack.CssExtractRspackPlugin.loader,
      isEnvDevelopment && 'style-loader',
      {
        loader: 'css-loader',
        options: {
          modules: options.modules,
        },
      },
      {
        loader: 'postcss-loader',
        options: {
          postcssOptions: {
            // 禁止从依赖包自动读 postcss 配置（会拉到 precss 旧 autoprefixer）
            config: false,
            plugins: postcssPlugins,
          },
        },
      },
    ]
  }

  const lessLoader = {
    loader: require.resolve('less-loader'),
    options: {
      lessOptions: {
        // Less 4 默认不自动算表达式，存量业务依赖 Less 3 行为
        math: 'always',
        javascriptEnabled: true,
        // 【过渡方案】Less 4.9+ 对 Less3 mixin 写法刷 DEPRECATED。
        // 根因是业务/依赖里仍用 `.mixin;` / `.fn (@x)`；要根治需改 less 源码或升依赖，
        // 不是关掉告警。在未批量改样式前先静默，避免淹没真实错误。
        quietDeprecations: true,
      },
    },
  }

  // 【过渡方案】过滤 Less logger 的已知无害告警（仍会漏到控制台 LOG）。
  // 典型：@gmfe/react tree_v2 里 :extend(.gm-tree-v2-list-item-expand) 因嵌套选择器匹配不到。
  // 根治应改 @gmfe/react 对应 less（需单独开分支），此处仅压制噪音。
  try {
    const lessImpl = require('less')
    if (lessImpl?.logger?.warn && !lessImpl.logger.__gmFilteredWarn) {
      const originalWarn = lessImpl.logger.warn.bind(lessImpl.logger)
      lessImpl.logger.warn = (msg) => {
        const text = String(msg || '')
        if (
          text.includes('DEPRECATED WARNING') ||
          text.includes('has no matches')
        ) {
          return
        }
        originalWarn(msg)
      }
      lessImpl.logger.__gmFilteredWarn = true
    }
  } catch (_) {
    // less 未安装时忽略
  }

  const rawHtmlTemplate = fs.readFileSync(paths.appHtml, 'utf8')
  const compileHtmlTemplate = require('lodash/template')(rawHtmlTemplate)

  let config = {
    target: ['browserslist'],
    stats: 'errors-warnings',
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    // Stop building when throw error
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment && 'cheap-module-source-map',
    entry: paths.appIndexJs,
    output: {
      path: paths.appBuild,
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: false,
      filename: isEnvDevelopment
        ? `js/bundle.js`
        : `js/[name]/[contenthash:8].js`,
      chunkFilename: isEnvDevelopment
        ? 'js/[name].chunk.js'
        : 'js/[name]/[contenthash:8].chunk.js',
      assetModuleFilename: 'media/[name].[contenthash][ext]',
      publicPath: paths.publicUrlOrPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: isEnvProduction
        ? (info) =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment &&
          ((info) =>
            path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
    },
    // cache: {
    //   type: 'filesystem',
    //   version: createEnvironmentHash(env.raw),
    //   cacheDirectory: paths.appWebpackCache,
    // },
    cache: false,
    infrastructureLogging: {
      level: 'none',
    },
    optimization: {
      minimize: false, // Disabled temporarily for rspack compatibility
      // minimizer: [
      //   new rspack.SwcJsMinimizerRspackPlugin({
      //     minimizerOptions: {
      //       compress: {
      //         ecma: 5,
      //         warnings: false,
      //         comparisons: false,
      //         inline: 2,
      //       },
      //       mangle: {
      //         safari10: true,
      //       },
      //       format: {
      //         ecma: 5,
      //         comments: false,
      //         asciiOnly: true,
      //       },
      //       keepClassNames: isEnvProductionProfile,
      //       keepFnames: isEnvProductionProfile,
      //     },
      //   }),
      //   new rspack.LightningCssMinimizerRspackPlugin(),
      // ],
      splitChunks: {},
    },
    resolve: {
      modules: ['node_modules', paths.appNodeModules],
      extensions: ['.js', '.tsx', '.ts'],
      alias: {
        ...pickBy(
          {
            // yarn link 后保持 react/core-js/core-js-pure 一致
            react:
              isEnvDevelopment &&
              path.resolve(paths.appPath + '/node_modules/react'),
            'react-router':
              isEnvDevelopment &&
              path.resolve(paths.appPath + '/node_modules/react-router'),
            'react-router-dom':
              isEnvDevelopment &&
              path.resolve(paths.appPath + '/node_modules/react-router-dom'),
            'core-js':
              isEnvDevelopment &&
              path.resolve(paths.appPath + '/node_modules/core-js'),
            'core-js-pure':
              isEnvDevelopment &&
              path.resolve(paths.appPath + '/node_modules/core-js-pure'),
            'bn.js':
              isEnvDevelopment &&
              path.resolve(paths.appPath + '/node_modules/bn.js'),
            '@gm-common':
              isEnvDevelopment &&
              path.resolve(paths.appPath + '/node_modules/@gm-common'),
            '@gm-pc':
              isEnvDevelopment &&
              path.resolve(paths.appPath + '/node_modules/@gm-pc'),
            common: path.resolve(paths.appPath, 'src/js/common'),
            stores: path.resolve(paths.appPath, 'src/js/stores'),
            svg: path.resolve(paths.appPath, 'src/svg'),
            img: path.resolve(paths.appPath, 'src/img'),
            '@': path.resolve(paths.appPath, 'src'),
            // Add src alias for rspack compatibility
            src: path.resolve(paths.appPath, 'src'),
            // npm 包 path@0.12 会抢解析且依赖 process，浏览器端必须强制走 path-browserify
            path: require.resolve('path-browserify'),
          },
          Boolean,
        ),
      },
      tsConfigPath: fs.existsSync(paths.appTsConfig)
        ? paths.appTsConfig
        : undefined,
      fallback: {
        'react/jsx-runtime': 'react/jsx-runtime.js',
        'react/jsx-dev-runtime': 'react/jsx-dev-runtime.js',
        // Node.js polyfills for browser
        'querystring': require.resolve('querystring-es3'),
        'path': require.resolve('path-browserify'),
        'stream': require.resolve('stream-browserify'),
        'buffer': require.resolve('buffer/'),
        'util': require.resolve('util/'),
        'events': require.resolve('events/'),
        'url': require.resolve('url/'),
        'process': require.resolve('process/browser'),
      },
    },
    module: {
      rules: [
        {
          oneOf: [
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              type: 'asset',
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            {
              test: /\.svg$/,
              use: [
                {
                  loader: '@svgr/webpack',
                  options: {
                    icon: true,
                    expandProps: 'start',
                    svgProps: {
                      fill: 'currentColor',
                      // className 冗余
                      className:
                        "{'gm-svg-icon t-svg-icon m-svg-icon ' + (props.className || '')}",
                    },
                  },
                },
              ],
            },
            // 使用 babel-loader：存量业务/组件库大量使用 :: bind 运算符，SWC 不支持
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: commonInclude,
              exclude: [
                /@babel[\\/]runtime/,
                /core-js/,
                /core-js-pure/,
              ],
              use: [
                {
                  loader: require.resolve('babel-loader'),
                  options: {
                    cacheDirectory: true,
                    cacheCompression: false,
                    compact: !isEnvDevelopment,
                  },
                },
              ],
            },
            {
              test: /\.module\.css$/,
              use: [...getCss({ modules: true })].filter(Boolean),
            },
            {
              test: /\.css$/,
              exclude: /\.module\.css$/,
              use: [...getCss()].filter(Boolean),
              sideEffects: true,
            },
            {
              test: /\.module\.less$/,
              use: [
                ...getCss({ modules: true }),
                lessLoader,
              ].filter(Boolean),
              sideEffects: true,
            },
            {
              test: /\.less$/,
              exclude: /\.module\.less$/,
              use: [...getCss(), lessLoader].filter(Boolean),
            },
            // 作为字符串引入（勿走 css/postcss，避免与 asset/source 冲突）
            {
              test: /\.(lesss|csss)$/,
              type: 'asset/source',
              use: [lessLoader],
            },
            {
              exclude: [/^$/, /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              type: 'asset/resource',
            },
            // ** STOP ** Are you adding a new loader?
            // Make sure to add the new loader(s) before the "file" loader.
          ],
        },
        {
          resourceQuery: /raw/,
          type: 'asset/source',
        },
      ].filter(Boolean),
    },
    plugins: [
      // 用 templateContent + lodash.template，绕过 Rspack 子编译 HTML（避免 __webpack_modules__ 报错）
      new HtmlWebpackPlugin({
        inject: true,
        templateContent: (params) => compileHtmlTemplate(params),
        // 兼容业务模板中的 htmlWebpackPlugin.options.*
        env: process.env.NODE_ENV,
        branch: process.env.GIT_BRANCH || 'none',
        commit: process.env.GIT_COMMIT || 'none',
      }),
      // Inlines the webpack runtime script. This script is too small to warrant
      // a network request. https://github.com/facebook/create-react-app/issues/5358
      // Disabled for rspack compatibility
      // isEnvProduction &&
      //   new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
      // new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
      // This gives some necessary context to module not found errors, such as
      // the requesting resource.
      // Disabled for rspack compatibility
      // new ModuleNotFoundPlugin(paths.appPath),
      new rspack.DefinePlugin({
        ...env.stringified,
        __DEBUG__: isEnvDevelopment,
        __DEVELOPMENT__: isEnvDevelopment,
        __TEST__: isEnvTest,
        __PRODUCTION__: isEnvProduction,
        __VERSION__: JSON.stringify(packageJson.version),
        __NAME__: JSON.stringify(packageJson.aliasName || 'none'),
        __CLIENT_NAME__: JSON.stringify(packageJson.clientName || 'none'),
        __BRANCH__: JSON.stringify(process.env.GIT_BRANCH || 'none'),
        __COMMIT__: JSON.stringify(process.env.GIT_COMMIT || 'none'),
        __AUTO_ROUTER_REG__:
          CUSTOM_AUTO_ROUTER_REG_ ||
          appConfig.autoRouterReg ||
          '/index\\.page\\./',
      }),
      new rspack.ProvidePlugin({
        process: [require.resolve('process/browser')],
        Buffer: ['buffer', 'Buffer'],
      }),
      isEnvDevelopment &&
        new ReactRefreshPlugin(),
      isEnvProduction &&
        new rspack.CssExtractRspackPlugin({
          filename: 'css/[name]/[contenthash:8].css',
          chunkFilename: 'css/[name]/[contenthash:8].chunk.css',
        }),
      new rspack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
      new WebpackManifestPlugin({
        fileName: 'asset-manifest.json',
        publicPath: paths.publicUrlOrPath,
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path
            return manifest
          }, seed)
          const entrypointFiles = entrypoints.main.filter(
            (fileName) => !fileName.endsWith('.map'),
          )

          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          }
        },
      }),
      new Warning2Error(),
    ].filter(Boolean),
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,
    devServer: {
      historyApiFallback: true,
      host: appConfig.host || '0.0.0.0',
      port: appConfig.port || 8080,
      proxy: appConfig.proxy || [],
      server: appConfig.https ? { type: 'https' } : undefined,
    },
    externals: {
      'gm-i18n': 'gmI18n',
      echarts: 'echarts',
    },
    ignoreWarnings: [
      /Failed to parse source map/,
      // trusted libs
      /not exported from \'(@antv)/,
      /was not found in '(@antv)/,
    ],
  }

  if (fs.existsSync(paths.appConfig + '/webpack.config.js')) {
    config = require(paths.appConfig + '/webpack.config.js')(config)
  }

  return config
}
