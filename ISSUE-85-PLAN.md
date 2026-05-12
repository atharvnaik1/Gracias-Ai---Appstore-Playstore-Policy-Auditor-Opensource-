# Issue #85 实现方案：NVIDIA API 密钥支持

## 问题分析

**当前状态：**
- 前端只支持输入通用 `apiKey` 字段
- 后端从 `process.env.NVIDIA_KEY` 或 `process.env.NEXT_PUBLIC_API_KEY` 读取
- 用户无法在前端直接输入 NVIDIA API 密钥

**需求：**
让应用支持 NVIDIA API 密钥，与 Claude API 密钥一样，用户可以在前端输入自己的 NVIDIA 密钥。

## 修改清单

### 1. 前端修改 (`src/app/page.tsx`)

**修改点：**
- 在 `provider === 'nvidia'` 时显示 NVIDIA 专属模型列表
- 添加 NVIDIA 到 provider 选项

### 2. 后端修改 (`src/app/api/audit/route.ts`)

**修改点：**
- 添加 `nvidia` 到 `VALID_PROVIDERS`
- 添加 NVIDIA NIM API 的路由逻辑
- 支持从前端传递 `apiKey`

### 3. 环境变量说明 (`.env.example`)

添加 NVIDIA API 密钥配置说明。

## 实现步骤

1. ✅ 克隆仓库
2. ✅ 分析当前代码结构
3. ⏳ 修改 `page.tsx` - 添加 NVIDIA provider
4. ⏳ 修改 `route.ts` - 添加 NVIDIA API 支持
5. ⏳ 测试验证
6. ⏳ 提交 PR

## 技术细节

### NVIDIA NIM API 格式
```typescript
apiUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
headers['Authorization'] = `Bearer ${apiKey.trim()}`;
payload = {
  model: model || 'meta/llama-3.1-405b-instruct',
  max_tokens: 4096,
  stream: true,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
};
```

### 前端 provider 模型映射
```typescript
nvidia: [
  { label: 'Llama 3.1 405B', value: 'meta/llama-3.1-405b-instruct' },
  { label: 'Llama 3.1 70B', value: 'meta/llama-3.1-70b-instruct' },
  { label: 'Mistral Large', value: 'mistralai/mistral-large' },
  { label: 'Gemma 2', value: 'google/gemma-2b' },
]
```

## 验收标准

- [ ] 前端 Provider 下拉菜单显示 "NVIDIA" 选项
- [ ] 选择 NVIDIA 后可选择对应模型
- [ ] 输入 NVIDIA API 密钥后可正常调用
- [ ] 与 Claude/OpenAI 等现有功能不冲突
- [ ] 流式响应正常工作

## 相关文件

- `src/app/page.tsx` - 前端 UI 和状态管理
- `src/app/api/audit/route.ts` - 后端 API 路由
- `.env.local` - 环境变量配置

## 时间估算

- 代码修改：30 分钟
- 测试验证：15 分钟
- PR 准备：15 分钟
- **总计：1 小时**

---

*Created: 2026-05-11 09:50 GMT+8*
