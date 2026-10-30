import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Session } from "../features/auth/Session";
import "../styles.css";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { ToastViewport } from "../shared/toast";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});
export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <Session />
          <ToastViewport />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
