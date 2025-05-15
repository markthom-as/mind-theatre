import ChatUI from '../../components/ChatUI';
import { useRouter } from 'next/router';

// This page will handle routes like /chat/some-id
// The ChatUI component itself will extract the chatId from the URL client-side
export default function ChatPage() {
  const router = useRouter();
  // The ChatUI component is already designed to pick up the chatId from window.location
  // so we don't strictly need to pass it as a prop from here if ChatUI handles it.
  // However, if ChatUI were to be refactored to accept chatId as a prop, you could do:
  // const { chatId } = router.query;

  return <ChatUI />;
}

// If you needed to fetch initial data on the server based on chatId, you might use getServerSideProps:
// export async function getServerSideProps(context) {
//   const { chatId } = context.params;
//   // Fetch initial data for the chat session if needed
//   // const initialData = await fetchSomeData(chatId);
//   return {
//     props: { /* initialData */ },
//   };
// } 