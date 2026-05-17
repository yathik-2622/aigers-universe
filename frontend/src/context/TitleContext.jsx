import { createContext, useContext, useState, useCallback } from 'react'

const TitleContext = createContext({ override: null, setOverride: () => {} })

export function TitleProvider({ children }) {
  const [override, setOverrideState] = useState(null)
  const setOverride = useCallback((value) => setOverrideState(value), [])
  return (
    <TitleContext.Provider value={{ override, setOverride }}>
      {children}
    </TitleContext.Provider>
  )
}

export function useTitle() {
  return useContext(TitleContext)
}
