import { ProductUpdatePublishForm } from "@/components/admin/product-update-publish-form";

export default function AdminProductUpdatesPage() {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">发布产品更新</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          向读者说明已经上线的功能与改善。发布后会立即公开，但不会发送站内通知。
        </p>
      </header>
      <ProductUpdatePublishForm />
    </div>
  );
}
