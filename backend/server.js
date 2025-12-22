const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// 调试信息
console.log('=== 服务器启动调试信息 ===');
console.log('当前工作目录:', process.cwd());
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('VERCEL:', !!process.env.VERCEL);

// 计算前端文件路径
const frontendDistPath = process.env.VERCEL 
  ? path.join(process.cwd(), 'frontend', 'dist')
  : path.join(__dirname, '../frontend/dist');

const indexPath = path.join(frontendDistPath, 'index.html');

console.log('前端dist路径:', frontendDistPath);
console.log('index.html路径:', indexPath);
console.log('index.html存在:', fs.existsSync(indexPath));

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(frontendDistPath));

// ===== 内存数据库 =====
let memoryDB = [];

// 从文件加载数据
function loadDataFromFile() {
  try {
    const filePath = path.join(__dirname, 'color_codes.txt');
    console.log('尝试从文件加载数据:', filePath);
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const codes = data.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      memoryDB = codes.map((code, index) => ({
        _id: `item_${index + 1}`,
        code,
        quantity: code === 'A1' ? 10 : 0, // A1有10个库存
        createdAt: new Date(),
        updatedAt: new Date()
      }));
      
      console.log(`✅ 从color_codes.txt加载了 ${memoryDB.length} 个编号`);
      return true;
    } else {
      console.log('❌ color_codes.txt文件不存在');
      // 创建一些示例数据
      memoryDB = [
        { _id: '1', code: 'A1', quantity: 10, createdAt: new Date(), updatedAt: new Date() },
        { _id: '2', code: 'A2', quantity: 5, createdAt: new Date(), updatedAt: new Date() },
        { _id: '3', code: 'B1', quantity: 0, createdAt: new Date(), updatedAt: new Date() },
        { _id: '4', code: 'B2', quantity: 3, createdAt: new Date(), updatedAt: new Date() },
        { _id: '5', code: 'C1', quantity: 8, createdAt: new Date(), updatedAt: new Date() }
      ];
      console.log('📦 使用示例数据');
      return false;
    }
  } catch (error) {
    console.error('加载数据失败:', error);
    return false;
  }
}

// 初始化数据
loadDataFromFile();

// 生成下一个ID
function generateId() {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ===== API 路由 =====

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SheepPD后端服务运行正常（内存数据库模式）',
    timestamp: new Date().toISOString(),
    database: 'memory',
    records: memoryDB.length
  });
});

// 系统状态检查
app.get('/api/status', (req, res) => {
  res.json({
    backend: 'running',
    database: 'memory',
    frontend: fs.existsSync(indexPath) ? 'available' : 'missing',
    records: memoryDB.length,
    timestamp: new Date().toISOString(),
    message: '使用内存数据库，数据重启后会重置'
  });
});

// 获取所有库存
app.get('/api/inventory', (req, res) => {
  console.log(`📦 返回库存数据: ${memoryDB.length} 条记录`);
  res.json({ 
    inventory: memoryDB,
    source: 'memory',
    message: '使用内存数据库，数据重启后会重置'
  });
});

// 获取单个库存项
app.get('/api/inventory/:id', (req, res) => {
  const id = req.params.id;
  const item = memoryDB.find(item => item._id === id);
  
  if (!item) {
    res.status(404).json({ error: '库存项不存在' });
    return;
  }
  
  res.json({ item });
});

// 添加新库存项
app.post('/api/inventory', (req, res) => {
  const { code, quantity = 0 } = req.body;
  
  if (!code) {
    res.status(400).json({ error: '编号不能为空' });
    return;
  }
  
  // 检查编号是否已存在
  if (memoryDB.some(item => item.code === code)) {
    res.status(400).json({ error: '该编号已存在' });
    return;
  }
  
  const newItem = {
    _id: generateId(),
    code,
    quantity: parseInt(quantity) || 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  memoryDB.push(newItem);
  console.log(`✅ 添加新库存项: ${code} (数量: ${quantity})`);
  
  res.json({ 
    message: '库存项添加成功', 
    itemId: newItem._id,
    item: newItem
  });
});

// 更新库存数量
app.put('/api/inventory/:id', (req, res) => {
  const { quantity } = req.body;
  const id = req.params.id;
  
  if (quantity === undefined || quantity < 0) {
    res.status(400).json({ error: '无效的数量' });
    return;
  }
  
  const itemIndex = memoryDB.findIndex(item => item._id === id);
  
  if (itemIndex === -1) {
    res.status(404).json({ error: '库存项不存在' });
    return;
  }
  
  memoryDB[itemIndex] = {
    ...memoryDB[itemIndex],
    quantity: parseInt(quantity),
    updatedAt: new Date()
  };
  
  console.log(`✏️ 更新库存: ${memoryDB[itemIndex].code} -> ${quantity}`);
  
  res.json({ 
    message: '库存更新成功',
    item: memoryDB[itemIndex]
  });
});

// 调整库存（增加或减少）
app.patch('/api/inventory/:id/adjust', (req, res) => {
  const { operation, amount } = req.body;
  const id = req.params.id;
  
  if (!operation || !amount || amount <= 0) {
    res.status(400).json({ error: '无效的操作或数量' });
    return;
  }
  
  const itemIndex = memoryDB.findIndex(item => item._id === id);
  
  if (itemIndex === -1) {
    res.status(404).json({ error: '库存项不存在' });
    return;
  }
  
  let newQuantity = memoryDB[itemIndex].quantity;
  
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
  
  memoryDB[itemIndex] = {
    ...memoryDB[itemIndex],
    quantity: newQuantity,
    updatedAt: new Date()
  };
  
  console.log(`🔄 调整库存: ${memoryDB[itemIndex].code} ${operation} ${amount} -> ${newQuantity}`);
  
  res.json({ 
    message: '库存调整成功', 
    newQuantity,
    item: memoryDB[itemIndex]
  });
});

// 删除库存项
app.delete('/api/inventory/:id', (req, res) => {
  const id = req.params.id;
  const itemIndex = memoryDB.findIndex(item => item._id === id);
  
  if (itemIndex === -1) {
    res.status(404).json({ error: '库存项不存在' });
    return;
  }
  
  const deletedItem = memoryDB[itemIndex];
  memoryDB.splice(itemIndex, 1);
  
  console.log(`🗑️ 删除库存项: ${deletedItem.code}`);
  
  res.json({ 
    message: '库存项删除成功',
    deletedItem
  });
});

// 手动导入数据的API端点
app.post('/api/import-from-file', (req, res) => {
  const success = loadDataFromFile();
  
  if (success) {
    res.json({ 
      message: `成功导入 ${memoryDB.length} 条记录`,
      records: memoryDB.length
    });
  } else {
    res.status(500).json({ 
      error: '导入数据失败',
      records: memoryDB.length
    });
  }
});

// 重置数据
app.post('/api/reset', (req, res) => {
  loadDataFromFile();
  res.json({ 
    message: '数据已重置',
    records: memoryDB.length
  });
});

// 导出数据
app.get('/api/export', (req, res) => {
  const exportData = memoryDB.map(item => ({
    code: item.code,
    quantity: item.quantity
  }));
  
  res.json({
    data: exportData,
    timestamp: new Date().toISOString(),
    records: memoryDB.length
  });
});

// ===== 前端路由 =====

// 根路径返回前端页面
app.get('/', (req, res) => {
  console.log('📄 访问根路径，返回前端页面');
  
  if (fs.existsSync(indexPath)) {
    console.log('✅ 找到index.html，发送文件');
    res.sendFile(indexPath);
  } else {
    // 返回一个简单的HTML页面
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SheepPD拼豆管理系统</title>
        <style>
          body { font-family: Arial; padding: 20px; text-align: center; }
          .status { background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px; }
        </style>
      </head>
      <body>
        <h1>🐑 SheepPD拼豆库存管理系统</h1>
        <div class="status">
          <h2>✅ 后端服务运行正常</h2>
          <p>数据库: 内存数据库 (${memoryDB.length} 条记录)</p>
          <p><a href="/api/inventory">查看库存</a> | <a href="/api/health">健康检查</a></p>
        </div>
        <p>前端文件路径: ${indexPath}</p>
        <p>前端文件存在: ${fs.existsSync(indexPath) ? '是' : '否'}</p>
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
if (process.env.VERCEL) {
  console.log('✅ 运行在Vercel环境');
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ 服务运行在 http://localhost:${PORT}`);
    console.log(`📊 内存数据库已加载 ${memoryDB.length} 条记录`);
  });
}