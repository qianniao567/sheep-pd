<template>
  <div id="app">
    <!-- 顶部标题 -->
    <div class="header">
      <h1>🐑 SheepPD 拼豆库存管理系统</h1>
      <p>lqy专属</p>
    </div>

    <!-- 系统状态 -->
    <div class="status-section">
      <div class="status-item" :class="{ online: backendStatus.message, offline: !backendStatus.message }">
        {{ backendStatus.message ? '✅ 系统在线' : '❌ 系统离线' }}
      </div>
      <button @click="fetchBackendStatus" class="refresh-btn">刷新状态</button>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 操作工具栏 -->
      <div class="toolbar">
        <button @click="showAddItemDialog = true" class="btn btn-primary">
          <span>+</span> 添加新编号
        </button>
        <button @click="fetchInventory" class="btn btn-secondary">
          🔄 刷新数据
        </button>
        <div class="search-box">
          <input 
            v-model="searchKeyword" 
            placeholder="搜索编号..." 
            class="search-input"
          />
        </div>
      </div>

      <!-- 库存表格 -->
      <div class="inventory-table">
        <div class="table-header">
          <div class="col-code">编号</div>
          <div class="col-quantity">库存数量</div>
          <div class="col-actions">操作</div>
        </div>
        
        <div v-if="loading" class="loading">加载中...</div>
        
        <div v-else-if="filteredItems.length === 0" class="empty-state">
          <div class="empty-icon">📦</div>
          <div>暂无库存数据</div>
          <button @click="showAddItemDialog = true" class="btn btn-primary">添加第一个库存项</button>
        </div>
        
        <div v-else class="table-body">
          <div v-for="item in filteredItems" :key="item._id" class="table-row">
            <div class="col-code">{{ item.code }}</div>
            <div class="col-quantity">
              <span :class="item.quantity < 5 ? 'low-stock' : 'normal-stock'">
                {{ item.quantity }}
              </span>
            </div>
            <div class="col-actions">
              <button @click="editItem(item)" class="btn btn-small btn-secondary">编辑</button>
              <button @click="adjustInventory(item, 'add')" class="btn btn-small btn-success">+</button>
              <button @click="adjustInventory(item, 'subtract')" class="btn btn-small btn-warning">-</button>
              <button @click="deleteItem(item._id)" class="btn btn-small btn-danger">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">总编号数</div>
          <div class="stat-value">{{ inventory.length }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">总库存量</div>
          <div class="stat-value">{{ totalQuantity }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">低库存项</div>
          <div class="stat-value">{{ lowStockCount }}</div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑对话框 -->
    <div v-if="showAddItemDialog" class="modal-overlay" @click.self="showAddItemDialog = false">
      <div class="modal">
        <h3>{{ editingItem ? '编辑库存项' : '添加新编号' }}</h3>
        
        <div class="form-group">
          <label>编号:</label>
          <input 
            v-model="itemForm.code" 
            placeholder="如: A1, B2, C3" 
            :disabled="editingItem"
          />
        </div>
        
        <div class="form-group">
          <label>库存数量:</label>
          <input 
            type="number" 
            v-model="itemForm.quantity" 
            min="0"
          />
        </div>
        
        <div class="modal-actions">
          <button @click="showAddItemDialog = false" class="btn btn-secondary">取消</button>
          <button @click="saveItem" class="btn btn-primary" :disabled="saving">
            {{ saving ? '保存中...' : (editingItem ? '更新' : '添加') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 库存调整对话框 -->
    <div v-if="showAdjustDialog" class="modal-overlay" @click.self="showAdjustDialog = false">
      <div class="modal">
        <h3>{{ adjustOperation === 'add' ? '增加库存' : '减少库存' }} - {{ selectedItem.code }}</h3>
        
        <div class="form-group">
          <label>调整数量:</label>
          <input 
            type="number" 
            v-model="adjustAmount" 
            min="1"
          />
        </div>
        
        <div class="modal-actions">
          <button @click="showAdjustDialog = false" class="btn btn-secondary">取消</button>
          <button @click="confirmAdjust" class="btn btn-primary" :disabled="adjusting">
            {{ adjusting ? '处理中...' : '确认' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 通知 -->
    <div v-if="notification.show" class="notification" :class="notification.type">
      {{ notification.message }}
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'

// API 服务
const apiService = {
  getBaseUrl() {
    // 自动判断环境
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3000/api';
    } else {
      // 部署环境使用相对路径
      return '/api';
    }
  },

  // 获取后端状态
  async getBackendStatus() {
    const response = await fetch(`${this.getBaseUrl()}/`);
    return response.json();
  },

  // 获取库存数据
  async getInventory() {
    const response = await fetch(`${this.getBaseUrl()}/inventory`);
    return response.json();
  },

  // 添加库存项
  async addItem(item) {
    const response = await fetch(`${this.getBaseUrl()}/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(item),
    });
    return response.json();
  },

  // 更新库存项
  async updateItem(id, item) {
    const response = await fetch(`${this.getBaseUrl()}/inventory/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(item),
    });
    return response.json();
  },

  // 删除库存项
  async deleteItem(id) {
    const response = await fetch(`${this.getBaseUrl()}/inventory/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // 调整库存
  async adjustInventory(id, operation, amount) {
    const response = await fetch(`${this.getBaseUrl()}/inventory/${id}/adjust`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operation,
        amount: parseInt(amount)
      }),
    });
    return response.json();
  }
};

export default {
  name: 'App',
  setup() {
    // 响应式数据
    const backendStatus = ref({});
    const inventory = ref([]);
    const searchKeyword = ref('');
    const loading = ref(false);
    const saving = ref(false);
    const adjusting = ref(false);
    const showAddItemDialog = ref(false);
    const showAdjustDialog = ref(false);
    const editingItem = ref(null);
    const selectedItem = ref(null);
    const adjustOperation = ref('add');
    const adjustAmount = ref(1);
    const itemForm = ref({
      code: '',
      quantity: 0
    });
    const notification = ref({
      show: false,
      message: '',
      type: 'success'
    });

    // 计算属性
    const filteredItems = computed(() => {
      if (!searchKeyword.value) return inventory.value;
      const keyword = searchKeyword.value.toLowerCase();
      return inventory.value.filter(item => 
        item.code.toLowerCase().includes(keyword)
      );
    });

    const totalQuantity = computed(() => {
      return inventory.value.reduce((sum, item) => sum + item.quantity, 0);
    });

    const lowStockCount = computed(() => {
      return inventory.value.filter(item => item.quantity < 5).length;
    });

    // 方法
    const showNotification = (message, type = 'success') => {
      notification.value = {
        show: true,
        message,
        type
      };
      setTimeout(() => {
        notification.value.show = false;
      }, 3000);
    };

    // 检查后端连接
    const fetchBackendStatus = async () => {
      try {
        const data = await apiService.getBackendStatus();
        backendStatus.value = data;
        console.log('后端连接成功');
      } catch (error) {
        console.error('后端连接失败:', error);
        backendStatus.value = {};
        showNotification('后端连接失败，请检查网络或服务状态', 'error');
      }
    };

    // 获取库存数据
    const fetchInventory = async () => {
      loading.value = true;
      try {
        const data = await apiService.getInventory();
        inventory.value = data.inventory || [];
        console.log('库存数据加载成功');
      } catch (error) {
        console.error('获取库存数据失败:', error);
        inventory.value = [];
        showNotification('获取库存数据失败', 'error');
      } finally {
        loading.value = false;
      }
    };

    // 保存库存项（添加或编辑）
    const saveItem = async () => {
      if (!itemForm.value.code.trim()) {
        showNotification('请输入编号', 'warning');
        return;
      }

      saving.value = true;
      try {
        let result;
        if (editingItem.value) {
          // 修复：使用 _id 而不是 id
          result = await apiService.updateItem(editingItem.value._id, itemForm.value);
        } else {
          result = await apiService.addItem(itemForm.value);
        }

        if (result.message) {
          showNotification(editingItem.value ? '更新成功' : '添加成功');
          showAddItemDialog.value = false;
          fetchInventory();
          resetForm();
        } else {
          throw new Error(result.error || '保存失败');
        }
      } catch (error) {
        console.error('保存失败:', error);
        showNotification(error.message || '保存失败', 'error');
      } finally {
        saving.value = false;
      }
    };

    // 编辑库存项
    const editItem = (item) => {
      editingItem.value = item;
      itemForm.value = { ...item };
      showAddItemDialog.value = true;
    };

    // 删除库存项
    const deleteItem = async (itemId) => {
      if (!confirm('确定要删除这个库存项吗？')) {
        return;
      }

      try {
        const result = await apiService.deleteItem(itemId);
        if (result.message) {
          showNotification('删除成功');
          fetchInventory();
        } else {
          throw new Error(result.error || '删除失败');
        }
      } catch (error) {
        console.error('删除失败:', error);
        showNotification(error.message || '删除失败', 'error');
      }
    };

    // 调整库存
    const adjustInventory = (item, operation) => {
      selectedItem.value = item;
      adjustOperation.value = operation;
      adjustAmount.value = 1;
      showAdjustDialog.value = true;
    };

    // 确认调整库存
    const confirmAdjust = async () => {
      if (!adjustAmount.value || adjustAmount.value <= 0) {
        showNotification('请输入有效的数量', 'warning');
        return;
      }

      adjusting.value = true;
      try {
        // 修复：使用 _id 而不是 id
        const result = await apiService.adjustInventory(
          selectedItem.value._id, 
          adjustOperation.value, 
          adjustAmount.value
        );

        if (result.message) {
          showNotification(`库存${adjustOperation.value === 'add' ? '增加' : '减少'}成功`);
          showAdjustDialog.value = false;
          fetchInventory();
        } else {
          throw new Error(result.error || '调整失败');
        }
      } catch (error) {
        console.error('调整失败:', error);
        showNotification(error.message || '调整失败', 'error');
      } finally {
        adjusting.value = false;
      }
    };

    // 重置表单
    const resetForm = () => {
      editingItem.value = null;
      itemForm.value = {
        code: '',
        quantity: 0
      };
    };

    // 生命周期
    onMounted(() => {
      fetchBackendStatus();
      fetchInventory();
    });

    // 观察器
    watch(showAddItemDialog, (newVal) => {
      if (!newVal) {
        setTimeout(() => resetForm(), 300);
      }
    });

    return {
      backendStatus,
      inventory,
      searchKeyword,
      loading,
      saving,
      adjusting,
      showAddItemDialog,
      showAdjustDialog,
      editingItem,
      selectedItem,
      adjustOperation,
      adjustAmount,
      itemForm,
      notification,
      filteredItems,
      totalQuantity,
      lowStockCount,
      fetchBackendStatus,
      fetchInventory,
      saveItem,
      editItem,
      deleteItem,
      adjustInventory,
      confirmAdjust
    };
  }
}
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: #f8fafc;
  color: #334155;
  line-height: 1.6;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 头部样式 */
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header h1 {
  font-size: 2.2rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.header p {
  opacity: 0.9;
  font-size: 1.1rem;
}

/* 状态区域 */
.status-section {
  padding: 1.5rem;
  background: white;
  margin: 1.5rem;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.status-item {
  font-size: 1.2rem;
  font-weight: 600;
}

.status-item.online {
  color: #10b981;
}

.status-item.offline {
  color: #ef4444;
}

.refresh-btn {
  background: #6b7280;
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.3s;
}

.refresh-btn:hover {
  background: #4b5563;
}

/* 主内容区域 */
.main-content {
  padding: 0 1.5rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
}

/* 工具栏 */
.toolbar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.search-box {
  margin-left: auto;
  position: relative;
}

.search-input {
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  width: 250px;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* 按钮样式 */
.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 500;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5a6fd8;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
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
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

.btn:hover {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 表格样式 */
.inventory-table {
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  margin-bottom: 2rem;
}

.table-header {
  display: grid;
  grid-template-columns: 1fr 1fr 2fr;
  background: #f8fafc;
  font-weight: 600;
  padding: 1.25rem;
  border-bottom: 1px solid #e5e7eb;
}

.table-row {
  display: grid;
  grid-template-columns: 1fr 1fr 2fr;
  padding: 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  align-items: center;
  transition: background-color 0.2s;
}

.table-row:hover {
  background: #f8fafc;
}

.table-row:last-child {
  border-bottom: none;
}

.col-code {
  font-weight: 600;
  font-size: 1.1rem;
  color: #1f2937;
}

.col-quantity .low-stock {
  color: #ef4444;
  font-weight: bold;
}

.col-quantity .normal-stock {
  color: #10b981;
  font-weight: 600;
}

.col-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* 统计信息 */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: transform 0.3s;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-label {
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #667eea;
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  width: 100%;
  max-width: 450px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  animation: modalAppear 0.3s ease-out;
}

@keyframes modalAppear {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal h3 {
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
  color: #1f2937;
  text-align: center;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #374151;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.3s;
}

.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-group input:disabled {
  background-color: #f3f4f6;
  cursor: not-allowed;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
}

/* 加载和空状态 */
.loading, .empty-state {
  text-align: center;
  padding: 3rem;
  color: #6b7280;
  font-size: 1.1rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.5;
}

/* 通知样式 */
.notification {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  z-index: 1100;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.notification.success {
  background: #10b981;
}

.notification.error {
  background: #ef4444;
}

.notification.warning {
  background: #f59e0b;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .header {
    padding: 1.5rem 1rem;
  }
  
  .header h1 {
    font-size: 1.8rem;
  }
  
  .status-section {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
  
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-box {
    margin-left: 0;
  }
  
  .search-input {
    width: 100%;
  }
  
  .table-header, .table-row {
    grid-template-columns: 1fr 1fr 1fr;
    padding: 1rem;
  }
  
  .col-actions {
    flex-direction: column;
  }
  
  .stats {
    grid-template-columns: 1fr;
  }
  
  .modal {
    padding: 1.5rem;
  }
  
  .modal-actions {
    flex-direction: column;
  }
}
</style>