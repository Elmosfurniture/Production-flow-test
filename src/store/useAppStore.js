import { useState, useCallback } from 'react'

// Simple app store using useState
// Can be expanded to use Context API or a state management library like Zustand

let appState = {
  user: null,
  isLoading: false,
  error: null,
  theme: 'light'
}

export function useAppStore() {
  const [state, setState] = useState(appState)

  const setUser = useCallback((user) => {
    setState((prev) => {
      appState.user = user
      return { ...prev, user }
    })
  }, [])

  const setLoading = useCallback((isLoading) => {
    setState((prev) => {
      appState.isLoading = isLoading
      return { ...prev, isLoading }
    })
  }, [])

  const setError = useCallback((error) => {
    setState((prev) => {
      appState.error = error
      return { ...prev, error }
    })
  }, [])

  const setTheme = useCallback((theme) => {
    setState((prev) => {
      appState.theme = theme
      return { ...prev, theme }
    })
  }, [])

  const clearError = useCallback(() => {
    setState((prev) => {
      appState.error = null
      return { ...prev, error: null }
    })
  }, [])

  return {
    // State
    user: state.user,
    isLoading: state.isLoading,
    error: state.error,
    theme: state.theme,
    
    // Actions
    setUser,
    setLoading,
    setError,
    setTheme,
    clearError
  }
}
