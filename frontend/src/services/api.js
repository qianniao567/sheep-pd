// 环境判断
const getApiBase = () => {
  // 如果是浏览器环境，使用与 App.vue 相同的逻辑
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3000/api';
    }
  }
  // 否则返回相对路径
  return '/api';
}

const API_BASE = getApiBase()

// 库存相关 API
export const inventoryAPI = {
  // 获取所有库存
  async getAll() {
    try {
      const response = await fetch(`${API_BASE}/inventory`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.warn('获取真实库存失败，尝试演示数据:', error);
      // 降级到演示数据
      const demoResponse = await fetch(`${API_BASE}/inventory/demo`);
      return demoResponse.json();
    }
  },
  
  // 添加新编号
  async add(code, quantity) {
    const response = await fetch(`${API_BASE}/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, quantity: parseInt(quantity) }),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },
  
  // 更新数量 - 注意：这里应该用 item._id 而不是 code
  async update(id, quantity) {
    const response = await fetch(`${API_BASE}/inventory/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quantity: parseInt(quantity) }),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },
  
  // 删除编号
  async remove(id) {
    const response = await fetch(`${API_BASE}/inventory/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },
  
  // 调整库存
  async adjust(id, operation, amount) {
    const response = await fetch(`${API_BASE}/inventory/${id}/adjust`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operation, amount: parseInt(amount) }),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}