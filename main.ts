// main.ts
import { serve } from "https://deno.land/std@0.198.0/http/server.ts";

// 配置常量
const CONFIG = {
    PORT: 8000,
    KV_PATH: null,
    PASSWORD_KEY: ["om_qq_password"],
    COOKIE_KEY: ["om_qq_cookies"],
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"]
};

// 获取KV实例
async function getKv() {
    return await Deno.openKv(CONFIG.KV_PATH);
}

// 验证文件类型和大小
function validateFile(file: File): { valid: boolean; error?: string } {
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        return { valid: false, error: `文件大小超过限制 (最大 ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB)` };
    }

    if (!CONFIG.ALLOWED_TYPES.includes(file.type)) {
        return { valid: false, error: "不支持的文件类型" };
    }

    return { valid: true };
}

// 生成随机IP
function generateRandomIP(): string {
    return `${48 + Math.floor(Math.random() * 93)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

// 上传文件到OM平台
async function uploadToOm(file: File, cookies: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        const buffer = await file.arrayBuffer();
        const blob = new Blob([buffer], { type: file.type });
        const ip = generateRandomIP();

        const uploadFormData = new FormData();
        uploadFormData.append("Filedata", blob, file.name);
        uploadFormData.append("subModule", "userAuth_individual_head");
        uploadFormData.append("id", "WU_FILE_0");
        uploadFormData.append("name", file.name);
        uploadFormData.append("type", file.type);
        uploadFormData.append("lastModifiedDate", new Date().toUTCString());
        uploadFormData.append("appkey", "1");
        uploadFormData.append("isRetImgAttr", "1");
        uploadFormData.append("from", "user");

        const res = await fetch("https://om.qq.com/image/orginalupload", {
            method: "POST",
            headers: {
                "CLIENT-IP": ip,
                "X-FORWARDED-FOR": ip,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Referer": "https://om.qq.com/userReg/mediaInfo",
                "Cookie": cookies,
            },
            body: uploadFormData,
        });

        if (!res.ok) {
            const errorText = await res.text();
            return { success: false, error: errorText };
        }

        const result = await res.json();
        if (result?.response?.code === 0) {
            return { success: true, data: result.data };
        } else {
            return { success: false, error: result?.response?.msg || "上传失败" };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 设置Cookie处理器
async function handleSetCookie(req: Request): Promise<Response> {
    try {
        const form = await req.formData();
        const password = form.get("password")?.toString();
        const cookie = form.get("cookie")?.toString();

        if (!password || !cookie) {
            return Response.json({ error: "密码和Cookie不能为空" }, { status: 400 });
        }

        const kv = await getKv();
        const storedPwd = await kv.get(CONFIG.PASSWORD_KEY);

        if (!storedPwd.value) {
            await kv.set(CONFIG.PASSWORD_KEY, password);
            await kv.set(CONFIG.COOKIE_KEY, cookie);
            await kv.close();
            return Response.json({ message: "密码已设置，Cookies已保存" });
        } else {
            if (storedPwd.value !== password) {
                await kv.close();
                return Response.json({ error: "密码错误" }, { status: 403 });
            }
            await kv.set(CONFIG.COOKIE_KEY, cookie);
            await kv.close();
            return Response.json({ message: "Cookies已更新" });
        }
    } catch (error) {
        return Response.json({ error: "服务器错误" }, { status: 500 });
    }
}

// 文件上传处理器
async function handleFileUpload(req: Request): Promise<Response> {
    try {
        const contentType = req.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
            return Response.json({ error: "无效的内容类型" }, { status: 400 });
        }

        const form = await req.formData();
        const file = form.get("file") as File | null;

        if (!file) {
            return Response.json({ error: "未上传文件" }, { status: 400 });
        }

        const validation = validateFile(file);
        if (!validation.valid) {
            return Response.json({ error: validation.error }, { status: 400 });
        }

        const kv = await getKv();
        const cookieData = await kv.get(CONFIG.COOKIE_KEY);
        await kv.close();

        if (!cookieData.value) {
            return Response.json({ error: "未设置Cookie" }, { status: 401 });
        }

        const uploadResult = await uploadToOm(file, cookieData.value as string);

        if (uploadResult.success) {
            return Response.json({ url: uploadResult.data });
        } else {
            return Response.json({ error: uploadResult.error }, { status: 500 });
        }
    } catch (error) {
        return Response.json({ error: "上传过程中发生错误" }, { status: 500 });
    }
}

// 主页HTML
function getHomePage(): string {
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>高级图床上传服务</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
      <style>
        :root {
          --primary: #4361ee;
          --primary-dark: #3a56d4;
          --success: #06d6a0;
          --danger: #ef476f;
          --light: #f8f9fa;
          --dark: #212529;
          --gray: #6c757d;
          --border-radius: 8px;
          --shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          --transition: all 0.3s ease;
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', sans-serif;
          background-color: #f5f7ff;
          color: var(--dark);
          line-height: 1.6;
          padding: 0;
          margin: 0;
          min-height: 100vh;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        h1 {
          font-size: 2.5rem;
          font-weight: 600;
          color: var(--primary);
          margin-bottom: 0.5rem;
        }
        
        .subtitle {
          color: var(--gray);
          font-size: 1.1rem;
        }
        
        .upload-container {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        
        .upload-box {
          background: white;
          border-radius: var(--border-radius);
          box-shadow: var(--shadow);
          padding: 2rem;
          transition: var(--transition);
        }
        
        .upload-area {
          border: 2px dashed #d1d5db;
          border-radius: var(--border-radius);
          padding: 3rem 2rem;
          text-align: center;
          cursor: pointer;
          transition: var(--transition);
          margin-bottom: 1.5rem;
        }
        
        .upload-area:hover, .upload-area.dragover {
          border-color: var(--primary);
          background-color: rgba(67, 97, 238, 0.05);
        }
        
        .upload-icon {
          font-size: 3rem;
          color: var(--primary);
          margin-bottom: 1rem;
        }
        
        .upload-text {
          font-size: 1.1rem;
          margin-bottom: 0.5rem;
        }
        
        .upload-hint {
          color: var(--gray);
          font-size: 0.9rem;
        }
        
        .file-input {
          display: none;
        }
        
        .btn {
          display: inline-block;
          padding: 0.75rem 1.5rem;
          border-radius: var(--border-radius);
          border: none;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
          text-align: center;
        }
        
        .btn-primary {
          background-color: var(--primary);
          color: white;
        }
        
        .btn-primary:hover {
          background-color: var(--primary-dark);
        }
        
        .btn-block {
          display: block;
          width: 100%;
        }
        
        .progress-container {
          margin-top: 1.5rem;
          display: none;
        }
        
        .progress-bar {
          height: 8px;
          background-color: #e9ecef;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }
        
        .progress {
          height: 100%;
          background-color: var(--primary);
          width: 0;
          transition: width 0.3s ease;
        }
        
        .progress-text {
          font-size: 0.9rem;
          color: var(--gray);
          text-align: center;
        }
        
        .result-container {
          margin-top: 2rem;
          display: none;
        }
        
        .result-box {
          background-color: #f8f9fa;
          border-radius: var(--border-radius);
          padding: 1.5rem;
          word-break: break-all;
        }
        
        .result-title {
          font-weight: 500;
          margin-bottom: 0.5rem;
        }
        
        .result-url {
          color: var(--primary);
          text-decoration: none;
        }
        
        .result-url:hover {
          text-decoration: underline;
        }
        
        .copy-btn {
          margin-top: 1rem;
          background-color: var(--light);
          color: var(--dark);
          border: 1px solid #dee2e6;
        }
        
        .copy-btn:hover {
          background-color: #e9ecef;
        }
        
        .error-message {
          color: var(--danger);
          margin-top: 1rem;
          text-align: center;
        }
        
        .file-list {
          margin-top: 1rem;
          display: none;
        }
        
        .file-item {
          display: flex;
          align-items: center;
          padding: 0.75rem;
          border-bottom: 1px solid #e9ecef;
        }
        
        .file-icon {
          margin-right: 0.75rem;
          color: var(--primary);
        }
        
        .file-name {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .file-size {
          color: var(--gray);
          font-size: 0.9rem;
          margin-left: 1rem;
        }
        
        footer {
          text-align: center;
          margin-top: 3rem;
          color: var(--gray);
          font-size: 0.9rem;
        }
        
        @media (max-width: 768px) {
          .container {
            padding: 1rem;
          }
          
          h1 {
            font-size: 2rem;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>高级图床上传服务</h1>
          <p class="subtitle">安全、快速、稳定的图片托管解决方案</p>
        </header>
        
        <div class="upload-container">
          <div class="upload-box">
            <div id="uploadArea" class="upload-area">
              <div class="upload-icon">📁</div>
              <div class="upload-text">拖放文件到这里或点击选择文件</div>
              <div class="upload-hint">支持 JPG, PNG, GIF, WEBP 格式，最大 10MB</div>
            </div>
            
            <input type="file" id="fileInput" class="file-input" accept="image/jpeg,image/png,image/gif,image/webp">
            
            <button id="uploadBtn" class="btn btn-primary btn-block">上传图片</button>
            
            <div id="progressContainer" class="progress-container">
              <div class="progress-bar">
                <div id="progressBar" class="progress"></div>
              </div>
              <div id="progressText" class="progress-text">准备上传...</div>
            </div>
            
            <div id="errorMessage" class="error-message"></div>
          </div>
          
          <div id="resultContainer" class="result-container">
            <h3 class="result-title">上传成功!</h3>
            <div class="result-box">
              <a id="resultUrl" class="result-url" target="_blank" rel="noopener noreferrer"></a>
            </div>
            <button id="copyBtn" class="btn copy-btn btn-block">复制链接</button>
          </div>
          
          <div id="fileList" class="file-list">
            <h3>最近上传</h3>
            <div id="fileItems"></div>
          </div>
        </div>
        
        <footer>
          <p>© ${new Date().getFullYear()} 高级图床服务 · 所有权利保留</p>
        </footer>
      </div>
      
      <script>
        // DOM元素
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const resultContainer = document.getElementById('resultContainer');
        const resultUrl = document.getElementById('resultUrl');
        const copyBtn = document.getElementById('copyBtn');
        const errorMessage = document.getElementById('errorMessage');
        const fileList = document.getElementById('fileList');
        const fileItems = document.getElementById('fileItems');
        
        // 拖放功能
        uploadArea.addEventListener('dragover', (e) => {
          e.preventDefault();
          uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
          uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadArea.classList.remove('dragover');
          
          if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            updateFileInfo();
          }
        });
        
        // 点击上传区域触发文件选择
        uploadArea.addEventListener('click', () => {
          fileInput.click();
        });
        
        // 文件选择变化
        fileInput.addEventListener('change', updateFileInfo);
        
        function updateFileInfo() {
          if (fileInput.files.length) {
            const file = fileInput.files[0];
            uploadArea.querySelector('.upload-text').textContent = file.name;
            uploadArea.querySelector('.upload-hint').textContent = 
              \`\${(file.size / 1024 / 1024).toFixed(2)} MB · \${file.type}\`;
          }
        }
        
        // 上传按钮点击
        uploadBtn.addEventListener('click', async () => {
          if (!fileInput.files.length) {
            showError('请选择要上传的文件');
            return;
          }
          
          const file = fileInput.files[0];
          
          // 验证文件
          if (file.size > ${CONFIG.MAX_FILE_SIZE}) {
            showError(\`文件大小超过限制 (最大 \${${CONFIG.MAX_FILE_SIZE} / 1024 / 1024}MB)\`);
            return;
          }
          
          if (!${JSON.stringify(CONFIG.ALLOWED_TYPES)}.includes(file.type)) {
            showError('不支持的文件类型');
            return;
          }
          
          // 准备上传
          resetUI();
          progressContainer.style.display = 'block';
          uploadBtn.disabled = true;
          
          try {
            const formData = new FormData();
            formData.append('file', file);
            
            // 模拟进度（实际应用中可以使用XMLHttpRequest获取真实进度）
            let progress = 0;
            const progressInterval = setInterval(() => {
              progress += Math.random() * 10;
              if (progress > 90) progress = 90;
              updateProgress(progress, '上传中...');
            }, 200);
            
            // 执行上传
            const response = await fetch('/upload', {
              method: 'POST',
              body: formData
            });
            
            clearInterval(progressInterval);
            
            if (response.ok) {
              updateProgress(100, '上传完成!');
              const data = await response.json();
              const imageUrl = data.url.url;
              if (!imageUrl) {
                 throw new Error("从响应中获取图片 URL 失败");
              }
              showResult(imageUrl);
              addToFileList(file.name, imageUrl);
            } else {
              const errorData = await response.json();
              throw new Error(errorData.error || response.statusText);
            }
          } catch (error) {
            showError(error.message);
          } finally {
            uploadBtn.disabled = false;
          }
        });
        
        // 复制链接
        copyBtn.addEventListener('click', () => {
          const url = resultUrl.href;
          navigator.clipboard.writeText(url).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '已复制!';
            setTimeout(() => {
              copyBtn.textContent = originalText;
            }, 2000);
          });
        });
        
        // 更新进度条
        function updateProgress(percent, text) {
          progressBar.style.width = \`\${percent}%\`;
          progressText.textContent = text;
        }
        
        // 显示结果
        function showResult(url) {
          console.log(url);
          resultUrl.href = url.url;
          resultUrl.textContent = url.url;
          resultContainer.style.display = 'block';
        }
        
        // 显示错误
        function showError(message) {
          errorMessage.textContent = message;
          setTimeout(() => {
            errorMessage.textContent = '';
          }, 5000);
        }
        
        // 重置UI
        function resetUI() {
          progressBar.style.width = '0%';
          resultContainer.style.display = 'none';
          errorMessage.textContent = '';
        }
        
        // 添加到文件列表
        function addToFileList(name, url) {
          if (!fileList.style.display || fileList.style.display === 'none') {
            fileList.style.display = 'block';
          }
          
          const fileItem = document.createElement('div');
          fileItem.className = 'file-item';
          fileItem.innerHTML = \`
            <span class="file-icon">📷</span>
            <span class="file-name">\${name}</span>
            <a href="\${url.url}" target="_blank" class="file-size">查看</a>
          \`;
          
          fileItems.insertBefore(fileItem, fileItems.firstChild);
        }
        
        // 加载历史记录（可以从localStorage或API加载）
        function loadHistory() {
          // 这里可以添加从存储加载历史记录的逻辑
        }
        
        // 初始化
        loadHistory();
      </script>
    </body>
    </html>
  `;
}

// 主请求处理器
async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);

    try {
        // API路由
        if (req.method === "POST" && url.pathname === "/upload") {
            return await handleFileUpload(req);
        }

        if (url.pathname === "/set_cookie" && req.method === "POST") {
            return await handleSetCookie(req);
        }

        // 主页
        if (url.pathname === "/") {
            const headers = new Headers({
                "Content-Type": "text/html",
                // 添加 Permissions-Policy 头，允许写入剪贴板
                "Permissions-Policy": "clipboard-write=(self)"
            });
            return new Response(getHomePage(), { headers }); // 使用带有新 Headers 的对象
        }

        // 404处理
        return new Response("Not Found", { status: 404 });
    } catch (error) {
        console.error("处理请求时出错:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
}

// 启动服务器
console.log(`Server running on http://localhost:${CONFIG.PORT}`);
await serve(handler, { port: CONFIG.PORT });