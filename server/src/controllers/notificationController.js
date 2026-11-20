import * as notificationService from '../services/notificationService.js';
import { successResponse } from '../utils/apiResponse.js';
import { queryNotificationsSchema } from '../validators/notificationValidator.js';

export async function getNotifications(req, res, next) {
  try {
    const validated = queryNotificationsSchema.parse(req.query);
    const result = await notificationService.getNotifications(req.user, validated);
    return successResponse(res, result, 'Notifications retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function markAsRead(req, res, next) {
  try {
    const result = await notificationService.markNotificationAsRead(req.user, req.params.id);
    return successResponse(res, result, 'Notification marked as read');
  } catch (err) {
    next(err);
  }
}

export async function markAllAsRead(req, res, next) {
  try {
    const result = await notificationService.markAllNotificationsAsRead(req.user);
    return successResponse(res, result, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
}

