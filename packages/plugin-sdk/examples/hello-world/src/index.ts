import type { PluginContext, WorldOfficePlugin } from "@world-office/plugin-sdk"

const plugin: WorldOfficePlugin = {
  id: "hello-world",
  name: "Hello World",
  version: "1.0.0",
  description: "A simple hello world plugin example",

  init(ctx: PluginContext) {
    ctx.toolbar.registerButton({
      id: "hello-world-btn",
      label: "Say Hello",
      icon: "message-square",
      onClick: () => {
        alert("Hello from World Office Plugin!")
      },
    })

    ctx.menu.registerItem({
      id: "hello-world-menu",
      label: "Say Hello",
      menuPath: "tools",
      onClick: () => {
        alert("Hello from World Office Plugin!")
      },
    })

    ctx.panel.registerPanel({
      id: "hello-world-panel",
      title: "Hello World",
      position: "right",
      render(container: HTMLElement) {
        container.innerHTML = `
          <div style="padding: 16px; font-family: system-ui, sans-serif;">
            <h3 style="margin: 0 0 8px;">Hello World Plugin</h3>
            <p style="margin: 0 0 12px; color: #666;">
              This panel is rendered by the Hello World plugin example.
            </p>
            <button id="hw-panel-btn" style="
              padding: 8px 16px;
              background: #4f46e5;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            ">Click me</button>
          </div>
        `
        const btn = container.querySelector("#hw-panel-btn")
        btn?.addEventListener("click", () => alert("Hello from panel!"))
      },
    })
  },

  destroy() {
    console.log("[hello-world] Plugin destroyed")
  },
}

export default plugin
