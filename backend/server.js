require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');

const app = express();

// ===== 详细调试信息 =====
console.log('=== 🚀 服务器启动详细调试信息 ===');
console.log('📁 当前工作目录:', process.cwd());
console.log('📁 __dirname:', __dirname);
console.log('🌍 NODE_ENV:', process.env.NODE_ENV);
console.log('⚡ VERCEL:', !!process.env.VERCEL);
console.log('🔑 MONGODB_URI 已设置:', !!process.env.MONGODB_URI);

// 安全打印连接字符串
if (process.env.MONGODB_URI) {
  const uriForLog = process.env.MONGODB_URI.replace(/:([^:]+)@/, ':****@');
  console.log('🔗 MongoDB连接字符串:', uriForLog);
}

// 计算正确的文件路径
const frontendDistPath = path.join(process.cwd(), 'frontend', 'dist');
const indexPath = path.join(frontendDistPath, 'index.html');

console.log('🔍 前端dist路径:', frontendDistPath);
console.log('🔍 index.html路径:', indexPath);
console.log('✅ index.html存在:', fs.existsSync(indexPath));

// 列出目录内容
try {
  console.log('📂 当前工作目录内容:');
  const files = fs.readdirSync(process.cwd());
  files.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    const stat = fs.statSync(filePath);
    console.log(`  📁 ${file} - ${stat.isDirectory() ? '目录' : '文件'}`);
  });
} catch (e) {
  console.log('❌ 无法读取工作目录:', e.message);
}

// 检查frontend目录
try {
  const frontendDir = path.join(process.cwd(), 'frontend');
  console.log('📁 frontend目录存在:', fs.existsSync(frontendDir));
  if (fs.existsSync(frontendDir)) {
    console.log('📁 frontend目录内容:', fs.readdirSync(frontendDir));
  }
} catch (e) {
  console.log('❌ 无法读取frontend目录:', e.message);
}

// 检查dist目录
try {
  console.log('📁 dist目录存在:', fs.existsSync(frontendDistPath));
  if (fs.existsSync(frontendDistPath)) {
    console.log('📁 dist目录内容:', fs.readdirSync(frontendDistPath));
  }
} catch (e) {
  console.log('❌ 无法读取dist目录:', e.message);
}

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务 - 修正路径
app.use(express.static(frontendDistPath));
console.log('✅ 静态文件服务已设置，路径:', frontendDistPath);

// ===== MongoDB 连接设置 =====
const uri = process.env.MONGODB_URI;
let dbClient;
let db;
let isDBConnected = false;

async function connectDB() {
  try {
    console.log('\n🔗 尝试连接MongoDB...');
    
    if (!uri) {
      console.log('❌ MONGODB_URI 未设置');
      return false;
    }
    
    console.log('📡 创建MongoDB客户端...');
    dbClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    
    console.log('🔄 连接数据库...');
    await dbClient.connect();
    db = dbClient.db('sheepPD');
    console.log('✅ MongoDB 连接成功');
    
    // 测试连接
    await db.command({ ping: 1 });
    console.log('✅ 数据库ping测试成功');
    
    isDBConnected = true;
    return true;
  } catch (error) {
    console.error('❌ MongoDB 连接失败:', error.message);
    return false;
  }
}

// ===== API 路由 =====

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SheepPD后端服务运行正常',
    timestamp: new Date().toISOString(),
    database: isDBConnected ? 'connected' : 'disconnected',
    frontend: fs.existsSync(indexPath) ? 'available' : 'missing',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 数据库状态
app.get('/api/db-status', async (req, res) => {
  try {
    if (!isDBConnected) {
      return res.json({
        status: 'disconnected',
        message: '数据库未连接',
        timestamp: new Date().toISOString()
      });
    }
    
    await db.command({ ping: 1 });
    res.json({
      status: 'connected',
      message: '数据库连接正常',
      timestamp: new Date().toISOString(),
      database: db.databaseName
    });
  } catch (error) {
    res.json({
      status: 'error',
      message: '数据库连接错误: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 获取库存数据
app.get('/api/inventory', async (req, res) => {
  if (!isDBConnected) {
    return res.status(500).json({ 
      error: '数据库未连接',
      suggestion: '请检查MongoDB Atlas配置'
    });
  }
  
  try {
    const inventory = await db.collection('inventory').find().toArray();
    res.json({ 
      inventory,
      total: inventory.length,
      source: 'mongodb'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 添加库存项
app.post('/api/inventory', async (req, res) => {
  if (!isDBConnected) {
    return res.status(500).json({ error: '数据库未连接' });
  }
  
  const { code, quantity = 0 } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: '编号不能为空' });
  }

  try {
    const result = await db.collection('inventory').insertOne({
      code,
      quantity: parseInt(quantity),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    res.json({ 
      message: '库存项添加成功', 
      itemId: result.insertedId 
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: '该编号已存在' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// 更新库存数量
app.put('/api/inventory/:id', async (req, res) => {
  if (!isDBConnected) {
    return res.status(500).json({ error: '数据库未连接' });
  }
  
  const { quantity } = req.body;
  const id = req.params.id;
  
  if (quantity === undefined || quantity < 0) {
    return res.status(400).json({ error: '无效的数量' });
  }
  
  try {
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: '无效的ID格式' });
    }
    
    const result = await db.collection('inventory').updateOne(
      { _id: new ObjectId(id) },
      { $set: { quantity: parseInt(quantity), updatedAt: new Date() } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: '库存项不存在' });
    }
    
    res.json({ message: '库存更新成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除库存项
app.delete('/api/inventory/:id', async (req, res) => {
  if (!isDBConnected) {
    return res.status(500).json({ error: '数据库未连接' });
  }
  
  const id = req.params.id;
  
  try {
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: '无效的ID格式' });
    }
    
    const result = await db.collection('inventory').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: '库存项不存在' });
    }
    
    res.json({ message: '库存项删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== 前端路由 =====

// 根路径
app.get('/', (req, res) => {
  console.log('🏠 访问根路径');
  
  if (fs.existsSync(indexPath)) {
    console.log('✅ 找到index.html，发送文件');
    res.sendFile(indexPath);
  } else {
    console.log('❌ index.html不存在，返回错误信息');
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>SheepPD - 错误</title></head>
      <body>
        <h1>🐑 SheepPD拼豆管理系统</h1>
        <div style="padding: 20px;">
          <h2 style="color: red;">❌ 前端文件未找到</h2>
          <p><strong>文件路径:</strong> ${indexPath}</p>
          <p><strong>建议:</strong> 请检查前端构建配置</p>
          <p><a href="/api/health">健康检查</a> | <a href="/api/inventory">库存API</a></p>
        </div>
      </body>
      </html>
    `);
  }
});

// 所有其他路由返回前端页面
app.get('*', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({
      error: '页面未找到',
      path: req.path
    });
  }
});

// ===== 启动服务器 =====
async function startServer() {
  console.log('\n🚀 启动服务器...');
  
  // 连接数据库
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.log('⚠️ 数据库连接失败，部分功能将不可用');
  }
  
  if (process.env.VERCEL) {
    console.log('✅ 运行在Vercel环境');
  } else {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`✅ 服务运行在 http://localhost:${PORT}`);
    });
  }
}

// 启动服务器
startServer();

module.exports = app;