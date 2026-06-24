import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  title: string
  description?: string
  tone: ToastTone
}

interface UiState {
  toasts: ToastItem[]
}

const initialState: UiState = {
  toasts: [],
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    enqueueToast: (state, action: PayloadAction<ToastItem>) => {
      state.toasts.unshift(action.payload)
      state.toasts = state.toasts.slice(0, 4)
    },
    dismissToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload)
    },
    clearToasts: (state) => {
      state.toasts = []
    },
  },
})

export const { enqueueToast, dismissToast, clearToasts } = uiSlice.actions
export default uiSlice.reducer
