const fs = require('fs')
const path = require('path')
const rspack = require('@rspack/core')
// Use HtmlRspackPlugin instead of HtmlWebpackPlugin for rspack compatibility
const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin')
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin')
const paths = require('./paths')
const getClientEnvironment = require('./env')
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin')
const ReactRefreshPlugin = require('@rspack/plugin-react-refresh')
const { WebpackManifestPlugin } = require('rspack-manifest-plugin')
const { Warning2Error } = require('./warning2error_plugin')
const { pickBy } = require('lodash')

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
            ident: 'postcss',
            plugins: [
              require('tailwindcss'),
              require('postcss-preset-env')({
                stage: 3,
              }),
            ],
          },
        },
      },
    ]
  }

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
            // The preset includes JSX, Flow, TypeScript, and some ESnext features.
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: commonInclude,
              use: [
                {
                  loader: 'builtin:swc-loader',
                  options: {
                    jsc: {
                      parser: {
                        syntax: 'typescript',
                        tsx: true,
                        dynamicImport: true,
                        decorators: true,
                      },
                      transform: {
                        react: {
                          runtime: hasJsxRuntime ? 'automatic' : 'classic',
                          refresh: isEnvDevelopment,
                        },
                      },
                      // externalHelpers: true, // Disabled for rspack compatibility
                    },
                    sourceMaps: shouldUseSourceMap,
                    env: {
                      targets: 'chrome 61',
                    },
                  },
                },
              ],
            },
            // Unlike the application JS, we only compile the standard ES features.
            {
              test: /\.(js|mjs)$/,
              include: commonInclude,
              use: [
                {
                  loader: 'builtin:swc-loader',
                  options: {
                    jsc: {
                      parser: {
                        syntax: 'ecmascript',
                        jsx: false,
                      },
                      transform: {
                        react: {
                          runtime: hasJsxRuntime ? 'automatic' : 'classic',
                        },
                      },
                    },
                    sourceMaps: shouldUseSourceMap,
                    env: {
                      targets: 'chrome 61',
                    },
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
                'less-loader',
              ].filter(Boolean),
              sideEffects: true,
            },
            {
              test: /\.less$/,
              exclude: /\.module\.less$/,
              use: [...getCss(), 'less-loader'].filter(
                Boolean,
              ),
            },
            // 作为字符串引入
            {
              test: /\.(lesss|csss)$/,
              type: 'asset/source',
              use: ['less-loader'],
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
      // Generates an `index.html` file with the <script> injected.
      new rspack.HtmlRspackPlugin({
        template: paths.appHtml,
        inject: true,
      }),
      // Inlines the webpack runtime script. This script is too small to warrant
      // a network request. https://github.com/facebook/create-react-app/issues/5358
      // Disabled for rspack compatibility
      // isEnvProduction &&
      //   new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
      // InterpolateHtmlPlugin is not compatible with HtmlRspackPlugin
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
