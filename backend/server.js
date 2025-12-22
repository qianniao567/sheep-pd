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

const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
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

async function importFromColorCodes() {
  try {
    console.log('开始导入数据...');
    const filePath = path.join(__dirname, 'color_codes.txt');
    console.log('文件路径:', filePath);
    
    if (!fs.existsSync(filePath)) {
      console.log('color_codes.txt文件不存在，跳过导入');
      return 0;
    }
    
    console.log('文件存在，开始读取...');
    const data = fs.readFileSync(filePath, 'utf8');
    console.log('文件内容长度:', data.length);
    
    const codes = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log('解析出的编号数量:', codes.length);
    console.log('前10个编号:', codes.slice(0, 10));
    
    const inventoryData = codes.map(code => ({
      code,
      quantity: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    if (inventoryData.length > 0) {
      console.log('开始插入数据到数据库...');
      const result = await db.collection('inventory').insertMany(inventoryData);
      console.log(`从color_codes.txt导入了 ${result.insertedCount} 个编号`);
      return result.insertedCount;
    } else {
      console.log('color_codes.txt中没有有效数据');
      return 0;
    }
  } catch (error) {
    console.error('从color_codes.txt导入数据失败:', error);
    throw error;
  }
}

async function initializeCollections() {
  try {
    console.log('开始初始化集合...');
    const inventoryCollection = db.collection('inventory');
    await inventoryCollection.createIndex({ code: 1 }, { unique: true });
    
    const count = await inventoryCollection.countDocuments();
    console.log(`当前库存集合中的记录数: ${count}`);
    
    if (count === 0) {
      console.log('库存集合为空，开始从color_codes.txt导入数据');
      const importedCount = await importFromColorCodes();
      console.log(`导入完成，共导入 ${importedCount} 条记录`);
    } else {
      console.log(`库存集合已有 ${count} 条记录，跳过导入`);
    }
  } catch (e) {
    console.error('初始化集合失败:', e);
  }
}

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

// 获取单个库存项
app.get('/api/inventory/:id', async (req, res) => {
  if (!db) {
    res.status(500).json({ error: '数据库未连接' });
    return;
  }
  
  const id = req.params.id;
  try {
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: '无效的ID格式' });
      return;
    }
    
    const item = await db.collection('inventory').findOne({ _id: new ObjectId(id) });
    if (!item) {
      res.status(404).json({ error: '库存项不存在' });
      return;
    }
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 添加新库存项
app.post('/api/inventory', async (req, res) => {
  if (!db) {
    res.status(500).json({ error: '数据库未连接' });
    return;
  }
  
  const { code, quantity = 0 } = req.body;
  
  if (!code) {
    res.status(400).json({ error: '编号不能为空' });
    return;
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
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ error: '该编号已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// 更新库存数量
app.put('/api/inventory/:id', async (req, res) => {
  if (!db) {
    res.status(500).json({ error: '数据库未连接' });
    return;
  }
  
  const { quantity } = req.body;
  const id = req.params.id;
  
  if (quantity === undefined || quantity < 0) {
    res.status(400).json({ error: '无效的数量' });
    return;
  }
  
  try {
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: '无效的ID格式' });
      return;
    }
    
    const result = await db.collection('inventory').updateOne(
      { _id: new ObjectId(id) },
      { $set: { quantity: parseInt(quantity), updatedAt: new Date() } }
    );
    
    if (result.matchedCount === 0) {
      res.status(404).json({ error: '库存项不存在' });
      return;
    }
    
    res.json({ message: '库存更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 调整库存（增加或减少）
app.patch('/api/inventory/:id/adjust', async (req, res) => {
  if (!db) {
    res.status(500).json({ error: '数据库未连接' });
    return;
  }
  
  const { operation, amount } = req.body;
  const id = req.params.id;
  
  if (!operation || !amount || amount <= 0) {
    res.status(400).json({ error: '无效的操作或数量' });
    return;
  }
  
  try {
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: '无效的ID格式' });
      return;
    }
    
    const item = await db.collection('inventory').findOne({ _id: new ObjectId(id) });
    if (!item) {
      res.status(404).json({ error: '库存项不存在' });
      return;
    }
    
    let newQuantity = item.quantity;
    if (operation === 'add') {
      newQuantity += parseInt(amount);
    } else if (operation === 'subtract') {
      newQuantity -= parseInt(amount);
      if (newQuantity < 0) {
        res.status(400).json({ error: '库存不足' });
        return;
      }
    } else {
      res.status(400).json({ error: '无效的操作类型' });
      return;
    }
    
    const result = await db.collection('inventory').updateOne(
      { _id: new ObjectId(id) },
      { $set: { quantity: newQuantity, updatedAt: new Date() } }
    );
    
    res.json({ 
      message: '库存调整成功', 
      newQuantity 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除库存项
app.delete('/api/inventory/:id', async (req, res) => {
  if (!db) {
    res.status(500).json({ error: '数据库未连接' });
    return;
  }
  
  const id = req.params.id;
  
  try {
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: '无效的ID格式' });
      return;
    }
    
    const result = await db.collection('inventory').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      res.status(404).json({ error: '库存项不存在' });
      return;
    }
    
    res.json({ message: '库存项删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 手动导入数据的API端点
app.post('/api/import-from-file', async (req, res) => {
  if (!db) {
    res.status(500).json({ error: '数据库未连接' });
    return;
  }
  
  try {
    const count = await importFromColorCodes();
    res.json({ message: `成功导入 ${count} 条记录` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== 前端路由（必须放在所有API路由之后） =====

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

// 启动服务器
startServer();

// Vercel需要导出app（这是唯一的导出语句）
module.exports = app;