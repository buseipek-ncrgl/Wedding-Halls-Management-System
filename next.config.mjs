/** @type {import('next').NextConfig} */
const nextConfig = {
  // Plesk'te Node.js çalıştırmadan deploy edebilmek için static export üretir.
  // Dinamik route'lar için generateStaticParams ile parametre üretmemiz gerekiyor.
  output: "export",
  // IIS/Plesk'te klasor tabanli route cozumlemesi icin gerekli.
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
