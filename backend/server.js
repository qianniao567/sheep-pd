require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');

const app = express();

// ===== 调试信息 =====
console.log('=== 服务器启动调试信息 ===');
console.log('当前工作目录:', process.cwd());
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('VERCEL:', process.env.VERCEL);
console.log('MONGODB_URI 已设置:', !!process.env.MONGODB_URI);

// 安全地打印连接字符串
if (process.env.MONGODB_URI) {
  const uriForLog = process.env.MONGODB_URI.replace(/:([^:]+)@/, ':****@');
  console.log('MongoDB连接字符串:', uriForLog);
}

// 中间件
app.use(cors());
app.use(express.json());

// 添加请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ===== MongoDB 连接设置 =====
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';

let dbClient;
let db;

async function connectDB() {
  try {
    console.log('🔗 尝试连接MongoDB...');
    
    if (!uri) {
      console.log('❌ MONGODB_URI 未设置，跳过数据库连接');
      return false;
    }
    
    console.log('连接字符串（隐藏密码）:', uri.replace(/:([^:]+)@/, ':****@'));
    
    // 增加连接超时时间
    dbClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    });
    
    await dbClient.connect();
    db = dbClient.db('sheepPD');
    console.log('✅ 成功连接到 MongoDB Atlas');
    
    // 测试数据库操作
    const collections = await db.listCollections().toArray();
    console.log('可用集合:', collections.map(c => c.name));
    
    await initializeCollections();
    return true;
  } catch (e) {
    console.error('❌ MongoDB 连接失败:');
    console.error('错误信息:', e.message);
    
    // 提供详细的错误信息
    if (e.message.includes('bad auth')) {
      console.log('可能原因: 用户名或密码错误');
    } else if (e.message.includes('ENOTFOUND')) {
      console.log('可能原因: 主机名解析失败，请检查连接字符串中的集群地址');
    } else if (e.message.includes('timeout')) {
      console.log('可能原因: 连接超时，请检查网络或MongoDB Atlas状态');
    } else if (e.message.includes('not authorized')) {
      console.log('可能原因: 用户没有权限访问数据库');
    }
    
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
    
    const data = fs.readFileSync(filePath, 'utf8');
    const codes = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    console.log('解析出的编号数量:', codes.length);
    
    const inventoryData = codes.map(code => ({
      code,
      quantity: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    
    if (inventoryData.length > 0) {
      const result = await db.collection('inventory').insertMany(inventoryData);
      console.log(`从color_codes.txt导入了 ${result.insertedCount} 个编号`);
      return result.insertedCount;
    }
    return 0;
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
    }
  } catch (e) {
    console.error('初始化集合失败:', e);
  }
}

// 演示数据生成函数
function generateDemoData() {
  try {
    const filePath = path.join(__dirname, 'color_codes.txt');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const codes = data.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .slice(0, 50);
      
      return codes.map((code, index) => ({
        _id: `demo${index + 1}`,
        code,
        quantity: code === 'A1' ? 10 : Math.floor(Math.random() * 5)
      }));
    }
  } catch (error) {
    console.error('生成演示数据失败:', error);
  }
  return [];
}

// ===== API 路由 =====
// 注意：这些API路由必须在通配符路由之前定义！

// 调试端点
app.get('/api/debug', (req, res) => {
  res.json({
    message: '调试信息',
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL,
    hasMongoUri: !!process.env.MONGODB_URI,
    mongoUri: process.env.MONGODB_URI ? 
      process.env.MONGODB_URI.replace(/:([^:]+)@/, ':****@') : 
      null,
    platform: process.platform,
    arch: process.arch,
    dbConnected: !!db
  });
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SheepPD后端服务运行正常',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    vercel: !!process.env.VERCEL
  });
});

// 系统状态检查
app.get('/api/status', (req, res) => {
  res.json({
    backend: 'running',
    database: db ? 'connected' : 'disconnected',
    frontend: 'embedded',
    timestamp: new Date().toISOString()
  });
});

// API状态检查
app.get('/api', (req, res) => {
  res.json({ 
    message: 'SheepPD拼豆库存管理系统API服务正常',
    timestamp: new Date().toISOString(),
    version: '1.0'
  });
});

// 演示数据端点
app.get('/api/inventory/demo', (req, res) => {
  try {
    const demoData = generateDemoData();
    res.json({ 
      inventory: demoData, 
      source: 'demo',
      message: '使用演示数据（数据库连接失败）'
    });
  } catch (error) {
    const fallbackData = [
      { _id: 'demo1', code: 'A1', quantity: 10 },
      { _id: 'demo2', code: 'A2', quantity: 5 },
      { _id: 'demo3', code: 'B1', quantity: 0 }
    ];
    res.json({ inventory: fallbackData, source: 'fallback' });
  }
});

// 数据库连接状态检查
app.get('/api/db-status', async (req, res) => {
  try {
    if (!db) {
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

// 获取所有库存
app.get('/api/inventory', async (req, res) => {
  if (!db) {
    console.log('数据库未连接，返回演示数据');
    try {
      const demoData = generateDemoData();
      // 对演示数据也进行排序
      demoData.sort((a, b) => a.code.localeCompare(b.code));
      return res.json({ 
        inventory: demoData, 
        source: 'demo-fallback',
        message: '数据库未连接，使用演示数据'
      });
    } catch (error) {
      return res.status(500).json({ error: '无法获取数据' });
    }
  }
  
  try {
    // 添加排序：按code字段升序排列
    const inventory = await db.collection('inventory').find().sort({ code: 1 }).toArray();
    res.json({ inventory });
  } catch (err) {
    console.error('获取库存失败，返回演示数据:', err.message);
    const demoData = generateDemoData();
    // 对演示数据也进行排序
    demoData.sort((a, b) => a.code.localeCompare(b.code));
    res.json({ 
      inventory: demoData, 
      source: 'demo-on-error',
      message: '数据库错误，使用演示数据'
    });
  }
});

// 获取所有字母分类
app.get('/api/categories', async (req, res) => {
  if (!db) {
    // 如果没有数据库连接，返回演示数据的分类
    const demoData = generateDemoData();
    const categories = [...new Set(demoData.map(item => item.code.match(/[A-Z]+/)[0]))].sort();
    return res.json({ categories });
  }
  
  try {
    const inventory = await db.collection('inventory').find().toArray();
    // 提取所有字母分类（去重并排序）
    const categories = [...new Set(inventory.map(item => {
      // 提取字母部分
      const match = item.code.match(/[A-Z]+/);
      return match ? match[0] : '其他';
    }))].sort();
    
    res.json({ categories });
  } catch (err) {
    console.error('获取分类失败:', err.message);
    res.json({ categories: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'M'] });
  }
});

// 获取指定字母分类下的所有编号
app.get('/api/category/:letter', async (req, res) => {
  const letter = req.params.letter.toUpperCase();
  
  if (!db) {
    // 如果没有数据库连接，返回演示数据
    const demoData = generateDemoData();
    const items = demoData.filter(item => item.code.startsWith(letter));
    return res.json({ 
      letter,
      items,
      count: items.length
    });
  }
  
  try {
    // 使用正则表达式匹配以该字母开头的编号
    const items = await db.collection('inventory')
      .find({ code: { $regex: `^${letter}\\d+` } })
      .sort({ code: 1 })
      .toArray();
    
    res.json({ 
      letter,
      items,
      count: items.length
    });
  } catch (err) {
    console.error(`获取${letter}分类失败:`, err.message);
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

// 手动导入数据
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

// 简单的内嵌前端页面 - 两级菜单版本
const simpleFrontendHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>🐑 SheepPD 拼豆库存管理系统</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container { 
            max-width: 1200px; 
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .header { 
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            color: white; 
            padding: 1.5rem; 
            text-align: center;
            position: relative;
        }
        
        .header h1 { 
            font-size: 1.8rem; 
            margin-bottom: 0.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        .header p { 
            opacity: 0.9; 
            font-size: 0.9rem;
        }
        
        .back-btn {
            position: absolute;
            left: 1.5rem;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            display: none;
        }
        
        .main-content {
            padding: 1.5rem;
        }
        
        /* 分类页面样式 */
        .categories-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }
        
        .category-card {
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 1.5rem 1rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        
        .category-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
            border-color: #667eea;
        }
        
        .category-letter {
            font-size: 2rem;
            font-weight: bold;
            color: #4f46e5;
            margin-bottom: 0.5rem;
        }
        
        .category-count {
            font-size: 0.9rem;
            color: #64748b;
            background: #e2e8f0;
            padding: 0.2rem 0.5rem;
            border-radius: 20px;
        }
        
        /* 详细页面样式 */
        .detail-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .detail-title {
            font-size: 1.5rem;
            color: #334155;
        }
        
        .detail-count {
            font-size: 0.9rem;
            color: #64748b;
        }
        
        .search-box {
            margin-bottom: 1.5rem;
        }
        
        .search-input {
            width: 100%;
            padding: 0.75rem 1rem;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        
        .search-input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .inventory-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 1rem;
        }
        
        .inventory-card {
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 1rem;
            text-align: center;
            transition: all 0.3s;
        }
        
        .inventory-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .item-code {
            font-size: 1.2rem;
            font-weight: bold;
            color: #1e293b;
            margin-bottom: 0.5rem;
        }
        
        .item-quantity {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        
        .quantity-low {
            color: #ef4444;
        }
        
        .quantity-normal {
            color: #10b981;
        }
        
        .item-actions {
            display: flex;
            gap: 0.5rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        /* 按钮样式 */
        .btn {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.3rem;
        }
        
        .btn-primary {
            background: #667eea;
            color: white;
        }
        
        .btn-primary:hover {
            background: #5a6fd8;
        }
        
        .btn-secondary {
            background: #6b7280;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #4b5563;
        }
        
        .btn-success {
            background: #10b981;
            color: white;
        }
        
        .btn-warning {
            background: #f59e0b;
            color: white;
        }
        
        .btn-danger {
            background: #ef4444;
            color: white;
        }
        
        .btn-small {
            padding: 0.3rem 0.6rem;
            font-size: 0.8rem;
        }
        
        /* 加载和空状态 */
        .loading {
            text-align: center;
            padding: 3rem;
            color: #64748b;
            font-size: 1.1rem;
        }
        
        .empty-state {
            text-align: center;
            padding: 3rem;
        }
        
        .empty-icon {
            font-size: 3rem;
            opacity: 0.5;
            margin-bottom: 1rem;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e2e8f0;
        }
        
        .stat-card {
            background: #f8fafc;
            padding: 1rem;
            border-radius: 10px;
            text-align: center;
        }
        
        .stat-label {
            font-size: 0.9rem;
            color: #64748b;
            margin-bottom: 0.5rem;
        }
        
        .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #667eea;
        }
        
        /* 通知样式 */
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            z-index: 1100;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .notification.success { background: #10b981; }
        .notification.error { background: #ef4444; }
        .notification.warning { background: #f59e0b; }
        
        /* 移动端优化 */
        @media (max-width: 768px) {
            .container { border-radius: 10px; }
            .header { padding: 1rem; }
            .header h1 { font-size: 1.5rem; }
            .categories-grid { grid-template-columns: repeat(3, 1fr); }
            .inventory-grid { grid-template-columns: repeat(2, 1fr); }
            .stats { grid-template-columns: 1fr; }
            .category-card { padding: 1rem 0.5rem; }
        }
        
        @media (max-width: 480px) {
            .categories-grid { grid-template-columns: repeat(2, 1fr); }
            .inventory-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <button class="btn back-btn" id="backBtn" onclick="goBack()">← 返回</button>
            <div>
                <h1>🐑 SheepPD 拼豆库存</h1>
                <p>lqy专属 - 两级菜单，管理更清晰</p>
            </div>
        </div>
        
        <div class="main-content">
            <!-- 分类页面 -->
            <div id="categoriesPage">
                <h2 style="text-align: center; margin-bottom: 1rem; color: #334155;">请选择颜色分类</h2>
                <div class="categories-grid" id="categoriesContainer">
                    <!-- 分类卡片将通过JavaScript动态生成 -->
                </div>
                
                <div class="stats" id="categoriesStats">
                    <!-- 统计信息将通过JavaScript动态生成 -->
                </div>
            </div>
            
            <!-- 详细页面 -->
            <div id="detailPage" style="display: none;">
                <div class="detail-header">
                    <h2 class="detail-title" id="detailTitle">A 类拼豆</h2>
                    <div class="detail-count" id="detailCount">共 26 个编号</div>
                </div>
                
                <div class="search-box">
                    <input type="text" id="searchInput" placeholder="在当前分类中搜索编号..." class="search-input" oninput="filterItems()">
                </div>
                
                <div id="loading" class="loading">加载中...</div>
                
                <div class="inventory-grid" id="inventoryContainer" style="display: none;">
                    <!-- 库存卡片将通过JavaScript动态生成 -->
                </div>
                
                <div id="emptyState" class="empty-state" style="display: none;">
                    <div class="empty-icon">📦</div>
                    <div style="margin: 1rem 0;">该分类下暂无库存数据</div>
                </div>
                
                <div class="stats" id="detailStats" style="display: none;">
                    <!-- 详细页面统计信息 -->
                </div>
            </div>
        </div>
    </div>
    
    <!-- 通知容器 -->
    <div id="notificationContainer"></div>
    
    <script>
    let currentLetter = '';
    let currentItems = [];
    let allCategories = [];
    
    // 初始化页面
    async function initPage() {
        showLoading('categoriesPage');
        try {
            // 加载分类数据
            const response = await fetch('/api/categories');
            const data = await response.json();
            allCategories = data.categories || [];
            
            renderCategories(allCategories);
            updateCategoriesStats();
            hideLoading('categoriesPage');
        } catch (error) {
            console.error('加载分类失败:', error);
            showNotification('加载分类失败: ' + error.message, 'error');
            hideLoading('categoriesPage');
        }
    }
    
    // 渲染分类卡片
    function renderCategories(categories) {
        const container = document.getElementById('categoriesContainer');
        container.innerHTML = '';
        
        // 为每个分类创建卡片
        categories.forEach(letter => {
            const card = document.createElement('div');
            card.className = 'category-card';
            card.onclick = () => loadCategory(letter);
            card.innerHTML = \`
                <div class="category-letter">\${letter}</div>
                <div class="category-count" id="count-\${letter}">加载中...</div>
            \`;
            container.appendChild(card);
            
            // 异步加载每个分类的数量
            loadCategoryCount(letter);
        });
    }
    
    // 加载分类数量
    async function loadCategoryCount(letter) {
        try {
            const response = await fetch(\`/api/category/\${letter}\`);
            const data = await response.json();
            document.getElementById(\`count-\${letter}\`).textContent = \`\${data.count}个\`;
        } catch (error) {
            document.getElementById(\`count-\${letter}\`).textContent = '?个';
        }
    }
    
    // 更新分类页面统计
    function updateCategoriesStats() {
        const statsContainer = document.getElementById('categoriesStats');
        statsContainer.innerHTML = \`
            <div class="stat-card">
                <div class="stat-label">总分类数</div>
                <div class="stat-value">\${allCategories.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">总编号数</div>
                <div class="stat-value" id="totalItemsCount">加载中...</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">低库存数</div>
                <div class="stat-value" id="lowStockCount">加载中...</div>
            </div>
        \`;
        
        // 加载总统计
        loadTotalStats();
    }
    
    // 加载总统计
    async function loadTotalStats() {
        try {
            const response = await fetch('/api/inventory');
            const data = await response.json();
            const items = data.inventory || [];
            
            // 更新总编号数
            document.getElementById('totalItemsCount').textContent = items.length;
            
            // 计算低库存数
            const lowStock = items.filter(item => item.quantity < 5).length;
            document.getElementById('lowStockCount').textContent = lowStock;
        } catch (error) {
            console.error('加载总统计失败:', error);
        }
    }
    
    // 加载分类详情
    async function loadCategory(letter) {
        currentLetter = letter;
        
        // 切换到详细页面
        document.getElementById('categoriesPage').style.display = 'none';
        document.getElementById('detailPage').style.display = 'block';
        document.getElementById('backBtn').style.display = 'block';
        
        // 更新页面标题
        document.getElementById('detailTitle').textContent = \`\${letter} 类拼豆\`;
        
        showLoading('detailPage');
        try {
            const response = await fetch(\`/api/category/\${letter}\`);
            const data = await response.json();
            currentItems = data.items || [];
            
            renderInventory(currentItems);
            updateDetailStats(currentItems);
            
            document.getElementById('detailCount').textContent = \`共 \${data.count} 个编号\`;
            hideLoading('detailPage');
        } catch (error) {
            console.error(\`加载\${letter}分类失败:\`, error);
            showNotification(\`加载\${letter}分类失败: \${error.message}\`, 'error');
            hideLoading('detailPage');
        }
    }
    
    // 渲染库存卡片
    function renderInventory(items) {
        const container = document.getElementById('inventoryContainer');
        const emptyState = document.getElementById('emptyState');
        
        if (items.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            document.getElementById('detailStats').style.display = 'none';
            return;
        }
        
        container.innerHTML = '';
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'inventory-card';
            card.id = \`item-\${item._id}\`;
            card.innerHTML = \`
                <div class="item-code">\${item.code}</div>
                <div class="item-quantity \${item.quantity < 5 ? 'quantity-low' : 'quantity-normal'}">
                    \${item.quantity}
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-secondary" onclick="editItem('\${item._id}')">编辑</button>
                    <button class="btn btn-small btn-success" onclick="adjustInventory('\${item._id}', 'add', 1)">+1</button>
                    <button class="btn btn-small btn-warning" onclick="adjustInventory('\${item._id}', 'subtract', 1)">-1</button>
                </div>
            \`;
            container.appendChild(card);
        });
        
        container.style.display = 'grid';
        emptyState.style.display = 'none';
        document.getElementById('detailStats').style.display = 'grid';
    }
    
    // 更新详细页面统计
    function updateDetailStats(items) {
        const statsContainer = document.getElementById('detailStats');
        const total = items.length;
        const lowStock = items.filter(item => item.quantity < 5).length;
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        
        statsContainer.innerHTML = \`
            <div class="stat-card">
                <div class="stat-label">编号数量</div>
                <div class="stat-value">\${total}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">总库存量</div>
                <div class="stat-value">\${totalQuantity}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">低库存数</div>
                <div class="stat-value" style="color: \${lowStock > 0 ? '#ef4444' : '#10b981'}">\${lowStock}</div>
            </div>
        \`;
    }
    
    // 搜索过滤
    function filterItems() {
        const keyword = document.getElementById('searchInput').value.toLowerCase();
        if (!keyword) {
            renderInventory(currentItems);
            return;
        }
        
        const filtered = currentItems.filter(item => 
            item.code.toLowerCase().includes(keyword)
        );
        renderInventory(filtered);
    }
    
    // 返回分类页面
    function goBack() {
        document.getElementById('categoriesPage').style.display = 'block';
        document.getElementById('detailPage').style.display = 'none';
        document.getElementById('backBtn').style.display = 'none';
        document.getElementById('searchInput').value = '';
        
        // 刷新分类数据
        initPage();
    }
    
    // 编辑项目
    function editItem(id) {
        const item = currentItems.find(i => i._id === id);
        if (!item) return;
        
        const newQuantity = prompt(\`请输入新的库存数量 (当前: \${item.quantity}):\`, item.quantity);
        if (newQuantity === null || newQuantity === '') return;
        
        const quantity = parseInt(newQuantity);
        if (isNaN(quantity) || quantity < 0) {
            showNotification('请输入有效的数量', 'error');
            return;
        }
        
        updateItemQuantity(id, quantity);
    }
    
    // 调整库存
    function adjustInventory(id, operation, amount) {
        const item = currentItems.find(i => i._id === id);
        if (!item) return;
        
        if (operation === 'subtract' && item.quantity - amount < 0) {
            showNotification('库存不足，无法减少', 'error');
            return;
        }
        
        updateItemQuantity(id, operation === 'add' ? item.quantity + amount : item.quantity - amount);
    }
    
    // 更新库存数量
    async function updateItemQuantity(id, quantity) {
        try {
            const response = await fetch(\`/api/inventory/\${id}\`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ quantity })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '更新失败');
            }
            
            showNotification('库存更新成功', 'success');
            
            // 重新加载当前分类
            loadCategory(currentLetter);
        } catch (error) {
            console.error('更新库存失败:', error);
            showNotification('更新失败: ' + error.message, 'error');
        }
    }
    
    // 显示/隐藏加载
    function showLoading(page) {
        if (page === 'categoriesPage') {
            document.getElementById('categoriesContainer').innerHTML = '<div class="loading">加载分类中...</div>';
        } else {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('inventoryContainer').style.display = 'none';
            document.getElementById('emptyState').style.display = 'none';
        }
    }
    
    function hideLoading(page) {
        if (page === 'detailPage') {
            document.getElementById('loading').style.display = 'none';
        }
    }
    
    // 显示通知
    function showNotification(message, type = 'success') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = \`notification \${type}\`;
        notification.textContent = message;
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transition = 'all 0.3s ease-out';
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // 页面加载时初始化
    window.onload = initPage;
    </script>
</body>
</html>
`;

// 根路径返回简单前端页面
app.get('/', (req, res) => {
  console.log('📄 访问根路径，返回两级菜单前端页面');
  res.set('Content-Type', 'text/html');
  res.send(simpleFrontendHTML);
});

// 所有其他路由返回前端页面
app.get('*', (req, res) => {
  console.log('🔀 捕获路由:', req.path, '返回前端页面');
  res.set('Content-Type', 'text/html');
  res.send(simpleFrontendHTML);
});

// ===== 启动逻辑 =====
async function startServer() {
  try {
    console.log('🚀 启动服务器...');
    
    // 连接数据库
    const dbConnected = await connectDB();
    if (!dbConnected) {
      console.log('⚠️ 数据库连接失败，API功能将不可用');
    }
    
    if (process.env.VERCEL) {
      console.log('✅ 运行在Vercel环境');
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

// Vercel需要导出app
module.exports = app;