# GitHub README 视频显示说明

GitHub 对 README 里的视频有一个小限制：仓库里的相对路径 `.mp4` 通常只是文件链接，不会稳定渲染成播放器。

推荐做法：

1. 打开 GitHub 上的 `README.md` 编辑页面，或打开任意 Issue/PR 评论框。
2. 把 `docs/demo/anchor-beta-demo-2026-05-24.mp4` 拖进 Markdown 编辑框。
3. GitHub 上传完成后，会自动生成类似下面的地址：

```text
https://github.com/user-attachments/assets/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

4. 把这个地址单独放在 README 的演示区。不要包进 Markdown 链接里。
5. 保存后，GitHub 会把它渲染为可播放的视频。

当前 README 已经保留完整 `.mp4` 文件链接，并用截图作为可点击预览。拿到 `user-attachments` 视频地址后，把演示区的说明文字替换为该地址即可。
