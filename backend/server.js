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
console.log('__dirname:', __dirname);
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

// 简单的内嵌前端页面
const simpleFrontendHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🐑 SheepPD 拼豆库存管理系统</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; color: #334155; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 10px; margin-bottom: 2rem; text-align: center; }
        .header h1 { font-size: 2rem; margin-bottom: 0.5rem; }
        .header p { opacity: 0.9; }
        
        .controls { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
        .btn { padding: 0.75rem 1.5rem; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
        .btn-primary { background: #667eea; color: white; }
        .btn-secondary { background: #6b7280; color: white; }
        .btn-success { background: #10b981; color: white; }
        .btn-warning { background: #f59e0b; color: white; }
        .btn-danger { background: #ef4444; color: white; }
        
        .inventory-table { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .table-header, .table-row { display: grid; grid-template-columns: 1fr 1fr 2fr; padding: 1rem; border-bottom: 1px solid #e5e7eb; }
        .table-header { background: #f8fafc; font-weight: 600; }
        .loading { padding: 3rem; text-align: center; }
        .notification { position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem; border-radius: 8px; color: white; z-index: 1000; }
        .success { background: #10b981; }
        .error { background: #ef4444; }
        
        @media (max-width: 768px) {
            .table-header, .table-row { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🐑 SheepPD 拼豆库存管理系统</h1>
            <p>lqy专属 - 随时随地在手机上查看和修改库存</p>
        </div>
        
        <div class="controls">
            <button class="btn btn-primary" onclick="showAddDialog()">+ 添加编号</button>
            <button class="btn btn-secondary" onclick="loadInventory()">🔄 刷新</button>
            <input type="text" id="search" placeholder="搜索编号..." oninput="filterItems()" style="padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; flex: 1;">
        </div>
        
        <div id="loading" class="loading">加载中...</div>
        
        <div id="inventory-table" class="inventory-table" style="display: none;">
            <div class="table-header">
                <div>编号</div>
                <div>库存数量</div>
                <div>操作</div>
            </div>
            <div id="table-body"></div>
        </div>
        
        <div id="empty" style="text-align: center; padding: 3rem; display: none;">
            <div style="font-size: 3rem; opacity: 0.5;">📦</div>
            <div style="margin: 1rem 0;">暂无库存数据</div>
            <button class="btn btn-primary" onclick="showAddDialog()">添加第一个库存项</button>
        </div>
    </div>
    
    <!-- 添加/编辑对话框 -->
    <div id="addDialog" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 1000;">
        <div style="background: white; padding: 2rem; border-radius: 12px; width: 90%; max-width: 450px;">
            <h3 id="dialogTitle" style="margin-bottom: 1.5rem;">添加新编号</h3>
            <div style="margin-bottom: 1.5rem;">
                <label>编号:</label>
                <input id="itemCode" placeholder="如: A1, B2" style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; margin-top: 0.5rem;">
            </div>
            <div style="margin-bottom: 1.5rem;">
                <label>库存数量:</label>
                <input id="itemQuantity" type="number" min="0" value="0" style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; margin-top: 0.5rem;">
            </div>
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="closeDialog()">取消</button>
                <button class="btn btn-primary" onclick="saveItem()" id="saveBtn">添加</button>
            </div>
        </div>
    </div>
    
    <!-- 调整库存对话框 -->
    <div id="adjustDialog" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 1000;">
        <div style="background: white; padding: 2rem; border-radius: 12px; width: 90%; max-width: 450px;">
            <h3 id="adjustTitle" style="margin-bottom: 1.5rem;">调整库存</h3>
            <div style="margin-bottom: 1.5rem;">
                <label>调整数量:</label>
                <input id="adjustAmount" type="number" min="1" value="1" style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; margin-top: 0.5rem;">
            </div>
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="closeAdjustDialog()">取消</button>
                <button class="btn btn-primary" onclick="confirmAdjust()" id="adjustBtn">确认</button>
            </div>
        </div>
    </div>
    
    <script>
    let currentItems = [];
    let editingItem = null;
    let adjustingItem = null;
    let adjustOperation = 'add';
    
    // 加载库存数据
    async function loadInventory() {
        showLoading();
        try {
            const response = await fetch('/api/inventory');
            if (!response.ok) {
                throw new Error('获取数据失败');
            }
            const data = await response.json();
            currentItems = data.inventory || [];
            renderInventory(currentItems);
        } catch (error) {
            console.error('获取库存失败:', error);
            showNotification('获取库存失败: ' + error.message, 'error');
            // 尝试获取演示数据
            try {
                const demoResponse = await fetch('/api/inventory/demo');
                const demoData = await demoResponse.json();
                currentItems = demoData.inventory || [];
                renderInventory(currentItems);
                showNotification('使用演示数据', 'warning');
            } catch (e) {
                showEmpty();
            }
        }
    }
    
    // 渲染库存表格
    function renderInventory(items) {
        const tableBody = document.getElementById('table-body');
        const emptyDiv = document.getElementById('empty');
        const inventoryTable = document.getElementById('inventory-table');
        
        if (items.length === 0) {
            hideLoading();
            inventoryTable.style.display = 'none';
            emptyDiv.style.display = 'block';
            return;
        }
        
        tableBody.innerHTML = '';
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'table-row';
            row.innerHTML = \`
                <div>\${item.code}</div>
                <div><span style="color: \${item.quantity < 5 ? '#ef4444' : '#10b981'}; font-weight: 600;">\${item.quantity}</span></div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn btn-secondary" onclick="editItem('\${item._id}')">编辑</button>
                    <button class="btn btn-success" onclick="showAdjustDialog('\${item._id}', 'add')">+</button>
                    <button class="btn btn-warning" onclick="showAdjustDialog('\${item._id}', 'subtract')">-</button>
                    <button class="btn btn-danger" onclick="deleteItem('\${item._id}')">删除</button>
                </div>
            \`;
            tableBody.appendChild(row);
        });
        
        hideLoading();
        emptyDiv.style.display = 'none';
        inventoryTable.style.display = 'block';
    }
    
    // 搜索过滤
    function filterItems() {
        const keyword = document.getElementById('search').value.toLowerCase();
        if (!keyword) {
            renderInventory(currentItems);
            return;
        }
        const filtered = currentItems.filter(item => 
            item.code.toLowerCase().includes(keyword)
        );
        renderInventory(filtered);
    }
    
    // 显示添加对话框
    function showAddDialog() {
        editingItem = null;
        document.getElementById('dialogTitle').textContent = '添加新编号';
        document.getElementById('itemCode').value = '';
        document.getElementById('itemQuantity').value = 0;
        document.getElementById('itemCode').disabled = false;
        document.getElementById('saveBtn').textContent = '添加';
        document.getElementById('addDialog').style.display = 'flex';
    }
    
    // 关闭对话框
    function closeDialog() {
        document.getElementById('addDialog').style.display = 'none';
    }
    
    // 保存项目
    async function saveItem() {
        const code = document.getElementById('itemCode').value.trim();
        const quantity = parseInt(document.getElementById('itemQuantity').value);
        
        if (!code) {
            showNotification('请输入编号', 'error');
            return;
        }
        
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        
        try {
            let response;
            if (editingItem) {
                // 更新
                response = await fetch(\`/api/inventory/\${editingItem}\`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ quantity })
                });
            } else {
                // 添加
                response = await fetch('/api/inventory', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ code, quantity })
                });
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '保存失败');
            }
            
            showNotification(editingItem ? '更新成功' : '添加成功', 'success');
            closeDialog();
            loadInventory();
        } catch (error) {
            console.error('保存失败:', error);
            showNotification('保存失败: ' + error.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = editingItem ? '更新' : '添加';
        }
    }
    
    // 编辑项目
    function editItem(id) {
        const item = currentItems.find(i => i._id === id);
        if (!item) return;
        
        editingItem = id;
        document.getElementById('dialogTitle').textContent = '编辑库存项';
        document.getElementById('itemCode').value = item.code;
        document.getElementById('itemQuantity').value = item.quantity;
        document.getElementById('itemCode').disabled = true;
        document.getElementById('saveBtn').textContent = '更新';
        document.getElementById('addDialog').style.display = 'flex';
    }
    
    // 删除项目
    async function deleteItem(id) {
        if (!confirm('确定要删除这个库存项吗？')) {
            return;
        }
        
        try {
            const response = await fetch(\`/api/inventory/\${id}\`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '删除失败');
            }
            
            showNotification('删除成功', 'success');
            loadInventory();
        } catch (error) {
            console.error('删除失败:', error);
            showNotification('删除失败: ' + error.message, 'error');
        }
    }
    
    // 显示调整对话框
    function showAdjustDialog(id, operation) {
        adjustingItem = id;
        adjustOperation = operation;
        const item = currentItems.find(i => i._id === id);
        if (!item) return;
        
        document.getElementById('adjustTitle').textContent = \`\${operation === 'add' ? '增加' : '减少'}库存 - \${item.code}\`;
        document.getElementById('adjustAmount').value = 1;
        document.getElementById('adjustDialog').style.display = 'flex';
    }
    
    // 关闭调整对话框
    function closeAdjustDialog() {
        document.getElementById('adjustDialog').style.display = 'none';
    }
    
    // 确认调整
    async function confirmAdjust() {
        const amount = parseInt(document.getElementById('adjustAmount').value);
        
        if (!amount || amount <= 0) {
            showNotification('请输入有效的数量', 'error');
            return;
        }
        
        const adjustBtn = document.getElementById('adjustBtn');
        adjustBtn.disabled = true;
        adjustBtn.textContent = '处理中...';
        
        try {
            const response = await fetch(\`/api/inventory/\${adjustingItem}/adjust\`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ operation: adjustOperation, amount })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || '调整失败');
            }
            
            showNotification(\`库存\${adjustOperation === 'add' ? '增加' : '减少'}成功\`, 'success');
            closeAdjustDialog();
            loadInventory();
        } catch (error) {
            console.error('调整失败:', error);
            showNotification('调整失败: ' + error.message, 'error');
        } finally {
            adjustBtn.disabled = false;
            adjustBtn.textContent = '确认';
        }
    }
    
    // 显示通知
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = \`notification \${type}\`;
        notification.textContent = message;
        notification.style.animation = 'slideIn 0.3s ease-out';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
        
        // 添加动画样式
        if (!document.getElementById('slideOutStyle')) {
            const style = document.createElement('style');
            style.id = 'slideOutStyle';
            style.textContent = \`
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            \`;
            document.head.appendChild(style);
        }
    }
    
    // 显示/隐藏加载
    function showLoading() {
        document.getElementById('loading').style.display = 'block';
    }
    
    function hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }
    
    // 显示空状态
    function showEmpty() {
        hideLoading();
        document.getElementById('inventory-table').style.display = 'none';
        document.getElementById('empty').style.display = 'block';
    }
    
    // 页面加载时获取数据
    window.onload = loadInventory;
    </script>
</body>
</html>
`;

app.get('/', (req, res) => {
  console.log('📄 访问根路径，返回简单前端页面');
  res.set('Content-Type', 'text/html');
  res.send(simpleFrontendHTML);
});

// 所有其他路由返回前端页面
app.get('*', (req, res) => {
  console.log('🔀 捕获路由:', req.path, '返回前端页面');
  res.set('Content-Type', 'text/html');
  res.send(simpleFrontendHTML);
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
      console.log('请检查Vercel环境变量中是否设置了MONGODB_URI');
      return false;
    }
    
    console.log('连接字符串（隐藏密码）:', uri.replace(/:([^:]+)@/, ':****@'));
    
    // 增加连接超时时间
    dbClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000, // 10秒超时
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
    console.error('完整错误:', e);
    
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
    const inventory = await db.collection('inventory').find().toArray();
    res.json({ inventory });
  } catch (err) {
    console.error('获取库存失败，返回演示数据:', err.message);
    const demoData = generateDemoData();
    res.json({ 
      inventory: demoData, 
      source: 'demo-on-error',
      message: '数据库错误，使用演示数据'
    });
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