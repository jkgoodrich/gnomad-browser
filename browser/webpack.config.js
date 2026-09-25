const path = require('path')

const CopyWebpackPlugin = require('copy-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const FaviconsWebpackPlugin = require('favicons-webpack-plugin')
const { EnvironmentPlugin } = require('webpack')
const tsConfig = require('../tsconfig.build.json')

const isDev = process.env.NODE_ENV === 'development'

// DONTMERGE: serve GRIN2B 3D missense constraint from a fixture until the API has the field
const missenseConstraint3dFixture = require('./demo/missense_constraint_3d_ENSG00000273079.json')

const MISSENSE_CONSTRAINT_3D_FIXTURE_GENE_ID = 'ENSG00000273079'

const serveMissenseConstraint3dFixture = (req, res, next) => {
  if (req.method !== 'POST') {
    next()
    return
  }
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks)
    const { operationName, variables } = JSON.parse(req.rawBody.toString())
    if (operationName !== 'MissenseConstraint3d') {
      next()
      return
    }
    const response =
      variables.geneId === MISSENSE_CONSTRAINT_3D_FIXTURE_GENE_ID
        ? missenseConstraint3dFixture
        : { data: { gene: { missense_constraint_3d: null } } }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(response))
  })
}

const gaTrackingId = process.env.GA_TRACKING_ID
if (process.env.NODE_ENV === 'production' && !gaTrackingId) {
  // eslint-disable-next-line no-console
  console.log('\nWarning: No GA tracking ID for production build\n')
}

const config = {
  devServer: {
    historyApiFallback: {
      disableDotRule: true,
    },
    hot: true,
    port: 8008,
    static: {
      publicPath: '/',
    },
    setupMiddlewares: (middlewares) => {
      middlewares.unshift({
        name: 'missense-constraint-3d-fixture',
        path: '/api',
        middleware: serveMissenseConstraint3dFixture,
      })
      return middlewares
    },
    proxy: [
      {
        context: '/api',
        target: process.env.GNOMAD_API_URL,
        pathRewrite: { '^/api': '' },
        changeOrigin: true,
        // Requests read by the fixture middleware have to have their body replayed
        onProxyReq: (proxyReq, req) => {
          if (req.rawBody) {
            proxyReq.setHeader('Content-Length', req.rawBody.length)
            proxyReq.write(req.rawBody)
          }
        },
      },
      {
        context: '/reads',
        target: process.env.READS_API_URL,
        pathRewrite: { '^/reads': '' },
        changeOrigin: true,
      },
    ],
  },
  devtool: 'source-map',
  entry: {
    bundle: path.resolve(__dirname, './src/index.tsx'),
  },
  mode: isDev ? 'development' : 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'esbuild-loader',
        options: {
          loader: 'tsx',
          target: 'es2015',
          tsconfigRaw: tsConfig,
        },
      },
      {
        test: /\.(j)sx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              rootMode: 'upward',
            },
          },
        ],
      },
      {
        test: /\.(pdf|gif|jpg|png|svg)$/,
        use: {
          loader: 'file-loader',
          options: {
            outputPath: 'assets/images',
          },
        },
      },
      {
        test: /\.md$/,
        use: {
          loader: '@gnomad/markdown-loader',
        },
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  output: {
    path: path.resolve(__dirname, './dist/public'),
    publicPath: '/',
    filename: isDev ? 'js/[name].js' : 'js/[name]-[contenthash].js',
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [path.resolve(__dirname, './src/opensearch.xml')],
    }),
    new CopyWebpackPlugin({
      patterns: [path.resolve(__dirname, './src/robots.txt')],
    }),
    new EnvironmentPlugin({
      REPORT_VARIANT_URL: null,
      REPORT_VARIANT_VARIANT_ID_PARAMETER: null,
      REPORT_VARIANT_DATASET_PARAMETER: null,
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, './src/index.html'),
      gaTrackingId: process.env.GA_TRACKING_ID,
      minify: isDev
        ? false
        : {
            collapseWhitespace: true,
            minifyCSS: true,
            minifyJS: true,
          },
    }),
    new FaviconsWebpackPlugin('./src/logo.svg'),
  ],
  // Use browserslist queries from .browserslistrc
  // Set to web in development as workaround for https://github.com/webpack/webpack-dev-server/issues/2758
  target: isDev ? 'web' : 'browserslist',
}

module.exports = config
