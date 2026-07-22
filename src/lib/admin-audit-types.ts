export const DISH_COMMENT_DELETE_AUDIT_ACTION = "dish_comment.delete" as const;
export const ADMIN_AUDIT_LOG_LIST_LIMIT = 100;

export type DishCommentDeleteAuditDetails = {
  content: string;
  authorEmail: string;
  authorNickname: string;
  canteenId: string;
  canteenName: string;
  menuItemId: string;
  menuItemName: string;
  commentCreatedAt: string;
};

export type AdminAuditDetails = DishCommentDeleteAuditDetails;

export type AdminAuditLog = {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  actorNickname: string;
  action: typeof DISH_COMMENT_DELETE_AUDIT_ACTION;
  targetType: "canteen_dish_comment";
  targetId: string;
  targetUserId: string | null;
  details: DishCommentDeleteAuditDetails;
  createdAt: Date;
};
