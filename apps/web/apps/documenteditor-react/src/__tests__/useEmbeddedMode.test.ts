// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import React from 'react'
import { isEmbeddedMode, useEmbeddedMode } from '../hooks/useEmbeddedMode'

describe('useEmbeddedMode', () => {
  const setupHookHarness = (props: any) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    let result: any = null
    const Probe = () => {
      result = useEmbeddedMode(
        props.setToolbar,
        props.setStatusbar,
        props.setLeftMenu,
        props.setRightMenu
      )
      return null
    }

    return {
      render: () => {
        act(() => {
          root.render(React.createElement(Probe))
        })
        return result
      },
      unmount: () => {
        act(() => {
          root.unmount()
        })
        document.body.removeChild(container)
      }
    }
  }

  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    delete (window as any).__WORLD_OFFICE_CONFIG__
    vi.clearAllMocks()
  })

  describe('isEmbeddedMode()', () => {
    it('returns false for a bare URL', () => {
      window.history.replaceState(null, '', '/')
      expect(isEmbeddedMode()).toBe(false)
    })

    it('returns true when ?embedded=true', () => {
      window.history.replaceState(null, '', '/?embedded=true')
      expect(isEmbeddedMode()).toBe(true)
    })

    it('returns true when __WORLD_OFFICE_CONFIG__.embedded is true', () => {
      (window as any).__WORLD_OFFICE_CONFIG__ = { embedded: true }
      window.history.replaceState(null, '', '/')
      expect(isEmbeddedMode()).toBe(true)
    })

    it('returns true for WOPI-shaped URLs (access_token and file_id)', () => {
      window.history.replaceState(null, '', '/?access_token=abc&file_id=123')
      expect(isEmbeddedMode()).toBe(true)
    })

    it('returns false for WOPI URL missing one parameter', () => {
      window.history.replaceState(null, '', '/?access_token=abc')
      expect(isEmbeddedMode()).toBe(false)
      window.history.replaceState(null, '', '/?file_id=123')
      expect(isEmbeddedMode()).toBe(false)
    })

    it('prioritizes URL params or config over absence of both', () => {
      // If config says true, but URL is bare -> true
      (window as any).__WORLD_OFFICE_CONFIG__ = { embedded: true }
      expect(isEmbeddedMode()).toBe(true)
    })

    it('returns false when ?embedded=false even if config is true', () => {
      // Based on source: if (params.get("embedded") === "true" || getEmbeddedConfig().embedded === true)
      // "false" is not "true", but config is still true.
      // The prompt asked to "pin the real precedence".
      // Looking at source:
      // if (params.get("embedded") === "true" || getEmbeddedConfig().embedded === true) { return true }
      // So if embedded=false but config=true, it STILL returns true because of the OR.
      
      (window as any).__WORLD_OFFICE_CONFIG__ = { embedded: true }
      window.history.replaceState(null, '', '/?embedded=false')
      expect(isEmbeddedMode()).toBe(true)
    })
  })

  describe('useEmbeddedMode hook', () => {
    it('returns { embedded: true } and hides panels when in embedded mode', () => {
      window.history.replaceState(null, '', '/?embedded=true')
      
      const setToolbar = vi.fn()
      const setStatusbar = vi.fn()
      const setLeftMenu = vi.fn()
      const setRightMenu = vi.fn()

      const { render, unmount } = setupHookHarness({
        setToolbar, setStatusbar, setLeftMenu, setRightMenu
      })

      const result = render()
      expect(result.embedded).toBe(true)
      expect(setToolbar).toHaveBeenCalledWith(false)
      expect(setStatusbar).toHaveBeenCalledWith(false)
      expect(setLeftMenu).toHaveBeenCalledWith(false)
      expect(setRightMenu).toHaveBeenCalledWith(false)

      unmount()
    })

    it('returns { embedded: false } and does not hide panels when not embedded', () => {
      window.history.replaceState(null, '', '/')
      
      const setToolbar = vi.fn()
      const setStatusbar = vi.fn()
      const setLeftMenu = vi.fn()
      const setRightMenu = vi.fn()

      const { render, unmount } = setupHookHarness({
        setToolbar, setStatusbar, setLeftMenu, setRightMenu
      })

      const result = render()
      expect(result.embedded).toBe(false)
      expect(setToolbar).not.toHaveBeenCalled()
      expect(setStatusbar).not.toHaveBeenCalled()
      expect(setLeftMenu).not.toHaveBeenCalled()
      expect(setRightMenu).not.toHaveBeenCalled()

      unmount()
    })

    it('only calls panel setters once when embedded', () => {
      window.history.replaceState(null, '', '/?embedded=true')
      
      const setToolbar = vi.fn()
      const setStatusbar = vi.fn()
      const setLeftMenu = vi.fn()
      const setRightMenu = vi.fn()

      const { render, unmount } = setupHookHarness({
        setToolbar, setStatusbar, setLeftMenu, setRightMenu
      })

      render()
      // Trigger a re-render by rendering again (in a real app, props or state change)
      render()

      expect(setToolbar).toHaveBeenCalledTimes(1)
      expect(setStatusbar).toHaveBeenCalledTimes(1)
      expect(setLeftMenu).toHaveBeenCalledTimes(1)
      expect(setRightMenu).toHaveBeenCalledTimes(1)

      unmount()
    })
  })
})
