import "./globals.css";

export const metadata = {
  title: "Beyond Marks | AI Academy Workshop",
  description: "Learn boldly. Build intelligently. Make your mark."
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
