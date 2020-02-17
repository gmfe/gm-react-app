gm-react-app

# 使用

安装

```shell script
yarn add @gm-react-app/scripts
```

安装&迁移 指引

```shell script
gm-react-app-scripts guide
```

# 说明

## 文件夹

```
my-project
  build/
  config/
    deploy.js
    local.js
    webpack.config.js
  src/
    index.js
    index.html
    svg/
      xxx.svg
  .eslintrc.js
  .gitignore
  .prettierrc.js
  babel.config.js
  package.json
  yarn.lock
```

/build 构建产物

配置 /config/deploy.js /config/local.js

```javascript
module.exports = {
  // 生产必填，开发默认 '/build/'
  publicPath: '//js.guanmai.cn/build/xxxx/',
  // 默认 8080
  port: 8080,
  // 默认不启用
  https: false,
  // 代理
  proxy: {
    '/core/*': {
      target: 'url',
      changeOrigin: true
    }
  }
}
```

/config/webpack.config.js 如果修改 webpack 配置，提供此文件

入口 /src/index.js

模板 /src/index.html，支持 ejs 语法

svg [svgr](https://github.com/gregberge/svgr) 只局限在 /src/svg 下，避免和其他 svg 冲突

## babel

默认值解析 src/目录下和 node_modules/下的 gm-、@gmfe、@gm-touch，其他需自行补充

## css

less

style-jsx

## 其他

react-hot-loader

环境

```
process.env.NODE_ENV development test production
process.env.GIT_BRANCH
process.env.GIT_COMMIT
```

变量

```
__DEBUG__
__DEVELOPMENT__
__TEST__
__PRODUCTION__
__VERSION__ 来自 package.json version
```
