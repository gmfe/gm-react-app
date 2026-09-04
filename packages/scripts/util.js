const fs = require('fs-extra')
const sh = require('shelljs')
const paths = require('./config/paths')
const execa = require('execa')
const shelljs = require('shelljs')
const { prompt } = require('inquirer')
const chalk = require('chalk')

const env = process.env.NODE_ENV
const isEnvDevelopment = env === 'development'
const isEnvTest = env === 'test'
const isEnvProduction = env === 'production'

function shellExec(com) {
  if (sh.exec(com).code !== 0) {
    sh.exit(1)
  }
}

const getLocalConfig = () => {
  let config = {}
  try {
    config = require(paths.appPath + '/config/local')
  } catch (err) {
    // nothing
  }

  return config
}

const getConfig = () => {
  let config
  try {
    config = require(paths.appPath + '/config/deploy')
  } catch (err) {
    console.log(err)
    throw new Error('没有找到 /config/deploy.js 文件')
  }

  // 开发默认 /
  if (isEnvDevelopment) {
    config.publicPath = '/'
  }

  // local 覆盖 deploy
  Object.assign(config, getLocalConfig())

  // 开发环境需要提供 publicPath
  if (!isEnvDevelopment && !config.publicPath) {
    throw new Error('production 没有提供 publicPath 字段')
  }
  if (process.env.GM_API_ENV) {
    try {
      config.proxy[0].target = process.env.GM_API_ENV
    } catch (e) {
      console.log(e)
    }
  }
  return config
}

// 仅编译 src + 需要转译的依赖；正则必须限定在 node_modules，
// 否则 /gm_/ 会误匹配项目目录名（如 gm_static_stationv2），把整个 node_modules 都打进 babel。
const nm = (name) => new RegExp(`[\\\\/]node_modules[\\\\/]${name}([\\\\/]|$)`)
const commonInclude = [
  paths.appSrc,
  nm('gm_api'),
  nm('gm-[^\\\\/]+'),
  nm('@gm-[^\\\\/]+'),
  nm('gm_[^\\\\/]+'),
  nm('gmfe'),
  nm('@gmfe'),
  nm('gm_static_storage'),
  nm('react-mgm'),
  nm('react-gm'),
  nm('query-string'),
  nm('split-on-first'),
  nm('strict-uri-encode'),
  nm('swiper'),
  nm('dom7'),
]

const packageJson = JSON.parse(fs.readFileSync(paths.appPackageJson))

function initGitEnv() {
  if (process.env.GIT_COMMIT || process.env.GIT_BRANCH) return
  const commit = sh
    .exec('git rev-parse HEAD', { silent: true })
    .stdout.replace('\n', '')
  const branch = sh
    .exec('git rev-parse --abbrev-ref HEAD', { silent: true })
    .stdout.replace('\n', '')

  process.env.GIT_COMMIT = commit
  process.env.GIT_BRANCH = branch
}
/*
 * @Description:获取分支url，会将 '/', '_'转换为 '-'
 */
function getGitBranch() {
  const res = execa.commandSync('git rev-parse --abbrev-ref HEAD')
  return res.stdout
}
/*
 * @Description:获取分支名
 */
function getBranchUrl() {
  const gitBranch = getGitBranch()
  return gitBranch.replace(/[_\\/]/g, '-')
}
/*
 * @Description: 根据不同的环境启动
 */
function startWithEnv(defaultEnv) {
  const PLACEHOLDER = 'GM_ENV'
  const BASE_URL = `https://${PLACEHOLDER}.guanmai.cn/`

  function generateEnvPath(env) {
    let replaceURL = 'x'

    switch (env) {
      case 'lite':
        replaceURL = 'q'
        break
      default:
        replaceURL = 'env-'
        if (env === 'dev') {
          replaceURL += 'develop'
        } else {
          replaceURL += getBranchUrl()
        }
        replaceURL += '.x.k8s'
        break
    }
    const target = BASE_URL.replace(PLACEHOLDER, replaceURL)
    return target
  }
  const envs = ['lite', 'feature']

  function saveEnvAndStart(env) {
    process.env.GM_API_ENV = generateEnvPath(env)
    shelljs.exec('yarn start')
  }

  if (defaultEnv && !envs.includes(defaultEnv))
    return Promise.reject(chalk.redBright('输入环境不对，只允许' + envs))
  if (envs.includes(defaultEnv)) {
    saveEnvAndStart(defaultEnv)
    return Promise.resolve(defaultEnv)
  } else {
    return prompt([
      {
        type: 'list',
        name: 'env',
        message: '请选择以下环境启动',
        default: generateEnvPath('feature'),
        choices: envs,
        validate: (env) => {
          if (!env) return chalk.redBright('请选择以下任一环境启动' + envs)
          return true
        },
      },
    ]).then(({ env }) => {
      saveEnvAndStart(env)
      return env
    })
  }
}

module.exports = {
  isEnvDevelopment,
  isEnvTest,
  isEnvProduction,
  packageJson,
  commonInclude,
  shellExec,
  getConfig,
  initGitEnv,
  startWithEnv,
}
