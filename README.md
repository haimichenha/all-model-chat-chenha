# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
第三次修改是基于Mozi佬的v1.1.1版本https://github.com/yeahhe365/All-Model-Chat.git ，集成了大体的主要功能包括基本需求如模型支持；网页搜索；上传方式；支持思考输出过程展示；文本文件创建；localStorage持久化聊天记录存取；快捷指令功能仍然有效。可惜忽略了一些细节功能，比如小窗画中画和右键，可以自己尝试再加一加。
这一次的修改主要体现在新增加的特殊导入导出功能，把导出的文本文件导入以后，常常发现大模型会因为文件内容稍大就得到的输出内容不尽人意，非常痛苦。这个特殊的导入功能会智能分段文本文件，然后对每一段进行分析以及总结，快速回顾对话的要点。然后就是优化了api的配置，可以保存多个api的配置。增加对系统提示词、api信息的导入导出。最后通过bbb佬的LLM代理地址https://api-proxy.me/gemini/ 实现无网络代理进行对话，支持图片，上传文本，创建文本功能。但是不支持特殊导出功能（无法进行后续部分输出）。
