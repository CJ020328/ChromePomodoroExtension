/// <reference types="chrome"/>

declare namespace chrome {
  export const runtime: {
    sendMessage: (
      message: any,
      callback?: (response: any) => void
    ) => void;
    onMessage: {
      addListener: (
        callback: (
          message: any,
          sender: any,
          sendResponse: (response?: any) => void
        ) => void
      ) => void;
      removeListener: (callback: any) => void;
    };
  };
} 