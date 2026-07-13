# EF Language Support for Visual Studio Code

[![License](https://img.shields.io/github/license/q1an1x/vscode-ef-language)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/q1an1x/vscode-ef-language)](https://github.com/q1an1x/vscode-ef-language/releases/latest)
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/q1an1x.ef-language-support?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=q1an1x.ef-language-support)
[![Visual Studio Code](https://img.shields.io/badge/Visual%20Studio%20Code-%5E1.85.0-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)

为[“易语言.飞扬”（EF）](http://dotef.eyuyan.com/)提供 Visual Studio Code 语言支持与工程工具链集成。

本扩展面向现有 EF 文本工程，能够识别 `.ef`、`.inf` 与 `.efp` 文件，并通过官方 `efc` 编译器完成构建。其目标是在保留原有编译器和类库兼容性的前提下，提供现代编辑器中的目录管理、代码导航、诊断与任务执行能力。

> [!IMPORTANT]
> 本项目是非官方社区项目，与“易语言.飞扬”、EFIDE 及其原开发公司不存在隶属或授权关系。本扩展不包含、不修改，也不重新分发 EF 编译器、类库或运行时。

## 功能概览

| 类别 | 能力 |
| --- | --- |
| 语言支持 | `.ef` / `.inf` 语法高亮，中英文关键字，系统属性，预编译指令，字符串、数值及嵌套块注释 |
| 代码理解 | 文档符号、工作区符号索引、悬停信息、代码补全、转到定义、查找引用及符号重命名 |
| 静态检查 | 编辑时检查括号、字符串与块注释的闭合状态 |
| 工程支持 | 解析 `.efp` 工程文件中的源码列表、输出类型、输出路径、类库名称与启动类 |
| 构建与运行 | 调用官方 `efc` 编译器，自动配置 `EF_LIB_PATHS`，显示构建日志并将编译错误映射到“问题”面板 |
| 本地文档 | 从命令面板打开已安装的 EF 白皮书和类库 API 文档 |

VS Code 原生文件资源管理器会按实际目录递归展示源码，因此无需受 EFIDE 工程视图的平面文件列表限制。

## 兼容性与前置条件

| 项目 | 要求 |
| --- | --- |
| Visual Studio Code | 1.85.0 或更高版本 |
| 易语言.飞扬 | 已安装官方编译器、类库与运行时 |
| 已验证工具链 | EF 编译器 1.00、EFIDE 0.2.2 Beta 所附工具链 |
| 已验证平台 | Windows |

构建与运行功能要求本机存在 `efc.exe`。扩展会优先检查用户设置，随后检查典型安装位置：

```text
C:\Program Files (x86)\dywt\ef\bin\efc.exe
```

未安装官方工具链时，语法高亮和部分代码浏览功能仍可使用，但无法编译或运行工程。

## 安装

### 从 Visual Studio Marketplace 安装

在 VS Code 扩展视图中搜索 `易语言.飞扬` 或 `EF Language Support`，选择本扩展并安装。也可以访问 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=q1an1x.ef-language-support)，或通过命令行安装：

```powershell
code --install-extension q1an1x.ef-language-support
```

### 从 GitHub Releases 安装

1. 打开项目的 [Releases](https://github.com/q1an1x/vscode-ef-language/releases/latest) 页面。
2. 下载最新版本的 `ef-language-support-*.vsix` 文件。
3. 在 VS Code 中运行命令 `Extensions: Install from VSIX...`（扩展：从 VSIX 安装）。
4. 选择下载的 VSIX 文件，并在安装完成后重新加载窗口。

也可以通过命令行安装：

```powershell
code --install-extension .\ef-language-support-0.1.1.vsix
```

### 从源码运行

```powershell
git clone git@github.com:q1an1x/vscode-ef-language.git
cd vscode-ef-language
pnpm install
code .
```

在 VS Code 中按 `F5` 启动 Extension Development Host。

## 使用方法

使用 VS Code 打开包含 `.efp` 工程文件的目录。工作区中只有一个工程时，扩展会自动选择该工程；存在多个工程时，可运行 `EF: 选择活动工程` 指定当前工程。

### 常用命令

| 命令 | 默认快捷键 | 说明 |
| --- | --- | --- |
| `EF: 编译当前工程` | `Ctrl+Shift+B` | 读取活动 `.efp` 并执行编译 |
| `EF: 编译并运行` | `F5`（EF 编辑器内） | 编译成功后启动输出文件 |
| `EF: 运行当前工程` | — | 运行最近一次成功构建的输出文件 |
| `EF: 选择活动工程` | — | 在多工程工作区中选择 `.efp` |
| `EF: 打开语言白皮书` | — | 打开本机 EF 白皮书 |
| `EF: 打开类库参考` | — | 打开本机 EF API 文档 |

### 配置项

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `ef.compilerPath` | 自动检测 | `efc.exe` 的完整路径 |
| `ef.installRoot` | 自动检测 | EF 安装根目录 |
| `ef.projectFile` | 自动选择 | 活动 `.efp` 文件，可使用工作区相对路径 |
| `ef.build.debug` | `true` | 编译时传递 `-dbg` |
| `ef.build.extraArguments` | `[]` | 传递给编译器的附加参数 |
| `ef.diagnostics.onType` | `true` | 编辑时启用结构检查 |

自定义编译器路径示例：

```json
{
  "ef.compilerPath": "D:\\EF\\bin\\efc.exe"
}
```

## 构建过程

扩展不会修改 `.efp` 文件。每次构建时，它会：

1. 读取活动工程的 XML 配置；
2. 验证工程引用的源码是否存在；
3. 收集工程目录中的 `.inf` 文件；
4. 在系统临时目录生成 `efc` makefile；
5. 设置标准库搜索路径并启动官方编译器；
6. 将编译器输出转换为 VS Code 日志和诊断信息。

构建产物仍写入 `.efp` 中配置的输出位置。

## 已知限制

- 尚未实现 EFIDE 可视化窗体设计器；
- 尚未实现基于 EF 调试接口的断点调试器；
- 代码理解采用轻量级源码索引，并非完整编译器前端，在复杂重载或动态类型场景中可能返回多个候选定义；
- 当前发布版本仅在 Windows 和 EF 编译器 1.00 上完成端到端验证。

问题报告和功能建议请提交至 [GitHub Issues](https://github.com/q1an1x/vscode-ef-language/issues)。报告构建问题时，请附上 VS Code 版本、EF 工具链版本、相关 `.efp` 配置以及“易语言.飞扬”输出通道中的完整日志。

## 开发与测试

项目使用 JavaScript 编写，无需转译。开发环境需要 Node.js 与 pnpm。

```powershell
pnpm install
pnpm test
pnpm exec vsce package --no-dependencies
```

核心测试覆盖源码符号解析、结构诊断、工程 XML 解析，以及包含空格的 Windows 工程路径。`test/integration-build.js` 可用于在已安装 EF 工具链的环境中执行真实工程编译。

项目结构：

```text
src/                     扩展入口、源码索引与工程解析
syntaxes/                TextMate 语法定义
snippets/                EF 代码片段
test/                    单元测试与编译集成测试
language-configuration.json
package.json
```

参与开发前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 版本发布

项目采用语义化版本号。推送 `v*` 标签后，GitHub Actions 会执行测试、生成 VSIX，并创建包含安装包的 GitHub Release。

## 许可证

本项目以 [MIT License](LICENSE) 开源。

“易语言.飞扬”、EFIDE 及相关名称和组件的权利归其各自权利人所有。本仓库中的实现依据公开随安装包提供的白皮书、编译器帮助、工程格式及本地 API 文档完成。
