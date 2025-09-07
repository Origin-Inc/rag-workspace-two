import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUser } from "~/services/auth/auth.server";
import { pageHierarchyService } from "~/services/page-hierarchy.server";
import { prisma } from "~/utils/db.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const { pageId } = params;
  
  if (!pageId) {
    return json({ error: "Page ID required" }, { status: 400 });
  }

  const method = request.method.toUpperCase();
  
  if (method === "DELETE") {
    // Delete page and all its descendants
    try {
      // First, get all descendants
      const descendants = await pageHierarchyService.getAllDescendants(pageId);
      const pageIdsToDelete = [pageId, ...descendants.map(d => d.id)];
      
      // Delete all pages in a transaction
      await prisma.$transaction(async (tx) => {
        // Delete related embeddings first
        await tx.pageEmbedding.deleteMany({
          where: { pageId: { in: pageIdsToDelete } }
        });
        
        await tx.blockEmbedding.deleteMany({
          where: { pageId: { in: pageIdsToDelete } }
        });
        
        // Then delete pages
        await tx.page.deleteMany({
          where: { id: { in: pageIdsToDelete } }
        });
      });
      
      return json({ success: true });
    } catch (error) {
      console.error("Error deleting page:", error);
      return json({ error: "Failed to delete page" }, { status: 500 });
    }
  }
  
  if (method === "PATCH") {
    // Move page to new parent
    const formData = await request.formData();
    const newParentId = formData.get("parentId") as string | null;
    
    try {
      const updatedPage = await pageHierarchyService.moveSubtree(
        pageId,
        newParentId,
        user.id
      );
      
      return json({ success: true, page: updatedPage });
    } catch (error: any) {
      console.error("Error moving page:", error);
      return json({ error: error.message || "Failed to move page" }, { status: 500 });
    }
  }
  
  return json({ error: "Method not allowed" }, { status: 405 });
}