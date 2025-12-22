// 环境判断
const getApiBase = () => {
  if (import.meta.env.MODE === 'production') {
    return '/api'
  }
  return 'http://localhost:3000/api'
}

const API_BASE = getApiBase()

// 库存相关 API
export const inventoryAPI = {
  // 获取所有库存
  async getAll() {
    const response = await fetch(`${API_BASE}/inventory`)
    return response.json()
  },
  
  // 添加新编号
  async add(code, quantity) {
    const response = await fetch(`${API_BASE}/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, quantity }),
    })
    return response.json()
  },
  
  // 更新数量
  async update(code, quantity) {
    const response = await fetch(`${API_BASE}/inventory/${code}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quantity }),
    })
    return response.json()
  },
  
  // 删除编号
  async remove(code) {
    const response = await fetch(`${API_BASE}/inventory/${code}`, {
      method: 'DELETE',
    })
    return response.json()
  }
}