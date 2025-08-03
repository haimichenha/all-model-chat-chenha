# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
基于mozi佬的版本，添加导出聊天记录为文本的功能，将缓存优化了一下，图片缓存占用降低了一些。
然后已经不知道修改过多少地方，修改了哪里，现在api地址利用bbb佬的罗列m代理地址，可以不使用网络代理进行纯文本对话。如果创建文本文件，上传不了文本文件，没有实力修改了。
其余功能应该是一样的，不清楚这次修改有没有导致什么隐藏的错误如果有了错误，请自行修改。
