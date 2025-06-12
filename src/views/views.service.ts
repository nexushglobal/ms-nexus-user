import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Role, RoleDocument } from 'src/roles/schemas/roles.schema';
import { CleanView } from './interfaces/clean-view.interface';

@Injectable()
export class ViewsService {
  constructor(@InjectModel(Role.name) private roleModel: Model<RoleDocument>) {}
  async getViewsByRoleId(roleId: string): Promise<CleanView[]> {
    const role = await this.roleModel
      .findById(roleId)
      .populate({
        path: 'views',
        match: { isActive: true },
        populate: {
          path: 'children',
          match: { isActive: true },
        },
      })
      .exec();

    if (!role || !role.views) {
      return [];
    }
    const parentViews = role.views
      .filter((view: any) => !view.parent && view.isActive)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    return parentViews.map((view: any) => this.buildViewTree(view));
  }

  private buildViewTree(view: any): CleanView {
    const children =
      view.children
        ?.filter((child: any) => child.isActive)
        .map((child: any) => this.buildViewTree(child))
        .sort(
          (a: CleanView, b: CleanView) => (a.order || 0) - (b.order || 0),
        ) || [];

    return {
      id: view._id.toString(),
      code: view.code,
      name: view.name,
      icon: view.icon,
      url: view.url,
      order: view.order || 0,
      metadata: view.metadata,
      children,
    };
  }
}
