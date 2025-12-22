require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');

const app = express();

// 调试信息
console.log('=== 服务器启动调试信息 ===');
console.log('当前工作目录:', process.cwd());
console.log('__dirname:', __dirname);

const frontendDistPath = path.join(__dirname, '../frontend/dist');
const indexPath = path.join(frontendDistPath, 'index.html');

console.log('前端dist路径:', frontendDistPath);
console.log('index.html路径:', indexPath);
console.log('index.html存在:', fs.existsSync(indexPath));

// 列出frontend目录内容
try {
  const frontendDir = path.join(__dirname, '../frontend');
  console.log('frontend目录内容:', fs.readdirSync(frontendDir));
} catch (e) {
  console.log('无法读取frontend目录:', e.message);
}

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务
app.use(express.static(frontendDistPath));

// ===== MongoDB 连接设置 =====
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';

let dbClient;
let db;

async function connectDB() {
  try {
    console.log('🔗 尝试连接MongoDB...');
    
    if (process.env.MONGODB_URI) {
      const uriForLog = process.env.MONGODB_URI.replace(/:([^:]+)@/, ':****@');
      console.log('MongoDB连接字符串:', uriForLog);
    }
    
    dbClient = new MongoClient(uri);
    await dbClient.connect();
    db = dbClient.db('sheepPD');
    console.log('✅ 成功连接到 MongoDB Atlas');
    
    await initializeCollections();
    return true;
  } catch (e) {
    console.error('❌ MongoDB 连接失败:', e.message);
    return false;
  }
}

// ... 保持你原有的MongoDB函数不变 ...

// ===== API 路由 =====

// API状态检查
app.get('/api', (req, res) => {
  res.json({ 
    message: 'SheepPD拼豆库存管理系统API服务正常',
    timestamp: new Date().toISOString(),
    version: '1.0'
  });
});

// 获取所有库存
app.get('/api/inventory', async (req, res) => {
  if (!db) {
    res.status(500).json({ error: '数据库未连接' });
    return;
  }
  
  try {
    const inventory = await db.collection('inventory').find().toArray();
    res.json({ inventory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ... 保持其他API路由不变 ...

// ===== 前端路由 =====

// 根路径返回前端页面
app.get('/', (req, res) => {
  console.log('📄 访问根路径，返回前端页面');
  
  if (fs.existsSync(indexPath)) {
    console.log('✅ 找到index.html，发送文件');
    res.sendFile(indexPath);
  } else {
    console.log('❌ index.html不存在，返回错误信息');
    res.status(500).json({
      error: '前端文件未找到',
      path: indexPath,
      suggestion: '请运行: cd frontend && npm run build'
    });
  }
});

// 所有其他路由返回前端页面
app.get('*', (req, res) => {
  console.log('🔀 捕获路由:', req.path, '返回前端页面');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({
      error: '页面未找到',
      path: req.path
    });
  }
});

// ===== 启动逻辑 =====

async function startServer() {
  try {
    const dbConnected = await connectDB();
    if (!dbConnected) {
      console.log('⚠️ 数据库连接失败，API功能将不可用');
    }
    
    if (process.env.VERCEL) {
      console.log('🚀 运行在Vercel环境');
    } else {
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.log(`✅ 服务运行在 http://localhost:${PORT}`);
      });
    }
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
  }
}

startServer();

module.exports = app;