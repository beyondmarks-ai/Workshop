import "./globals.css";

export const metadata = {
  title: "Welcome to Astra",
  description: "Welcome to Astra."
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
