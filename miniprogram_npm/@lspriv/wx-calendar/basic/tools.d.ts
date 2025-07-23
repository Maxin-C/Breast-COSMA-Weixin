import { View } from './constants';
import type { Voidable } from '../utils/shared';
import type { CalendarWeek, LayoutArea } from '../interface/component';
declare global {
    namespace WechatMiniprogram {
        namespace Component {
            interface AnimatedUpdater {
                (): SkylineStyles;
            }
            interface AnimatedUserConfig {
                immediate?: boolean;
                flush?: 'async' | 'sync';
            }
            interface AnimatedResult {
                styleId: number;
            }
            interface InstanceProperties {
                renderer: 'webview' | 'skyline';
                applyAnimatedStyle(selector: string, updater: AnimatedUpdater, userConfig?: AnimatedUserConfig, callback?: (result: AnimatedResult) => void): void;
                clearAnimatedStyle(selector: string, styleIds: Array<number>, callback?: () => void): void;
            }
        }
    }
}
export type SkylineStyles = Record<string, string | number>;
export interface Shared<T> {
    value: T;
}
export type BoundingClientRects = Array<WechatMiniprogram.BoundingClientRectCallbackResult>;
export type ComponentInstance = WechatMiniprogram.Component.Instance<WechatMiniprogram.Component.DataOption, WechatMiniprogram.Component.PropertyOption, WechatMiniprogram.Component.MethodOption>;
/**
 * 是否skyline渲染
 */
export declare const isSkyline: (renderer?: string) => renderer is "skyline";
/**
 * 警告
 */
export declare const warn: (...args: any[]) => void;
/**
 * 计算目标下标与当前下标差值，循环周期 CALENDAR_PANELS
 * @param idx 目标下标
 * @param curr 当前下标
 */
export declare const circularDiff: (idx: number, curr: number) => number;
/**
 * 延迟一部分操作到下一个时间片再执行。
 */
export declare const nextTick: <T extends Voidable<(...args: any[]) => any> = undefined, R = T extends NonNullable<T> ? Awaited<ReturnType<T>> : void>(callback?: T) => Promise<R>;
/**
 * 延迟几个时间片
 */
export declare const severalTicks: (n: number) => Promise<void>;
/**
 * 绑定 worklet动画
 */
export declare const applyAnimated: (instance: ComponentInstance, selector: string, updater: WechatMiniprogram.Component.AnimatedUpdater, options?: WechatMiniprogram.Component.AnimatedUserConfig) => Promise<number>;
/**
 * 取消 worklet 动画绑定
 */
export declare const clearAnimated: (instance: ComponentInstance, selector: string, ids: Array<number>) => Promise<void>;
/**
 * 获取节点信息
 * @param component 组件实例
 */
export declare const nodeRect: (component: ComponentInstance) => (selector: string) => Promise<BoundingClientRects>;
/**
 * 获取页面偏移
 * @param component 组件实例
 */
export declare const viewportOffset: (component: ComponentInstance) => Promise<WechatMiniprogram.ScrollOffsetCallbackResult>;
export interface OnceEmitter {
    emit: (...detail: any[]) => void;
    cancel: () => void;
}
/**
 * 事件触发器
 */
export declare const onceEmitter: (instance: ComponentInstance, event: string) => OnceEmitter;
/**
 * 获取布局区域隐藏样式
 * @param layout 当前布局区域
 */
export declare const layoutHideCls: (layout?: Array<LayoutArea>) => string;
/**
 * 添加区域隐藏样式
 */
export declare const addLayoutHideCls: (cls: string, area: LayoutArea) => string;
/**
 * 某个布局区域是否隐藏
 * @param cls 隐藏样式
 * @param area 检查区域
 */
export declare const hasLayoutArea: (cls: string, area: LayoutArea) => boolean;
/**
 * 获取视图值
 * @param view 视图
 */
export declare const viewFlag: (view: string) => View;
/**
 * 是否是一个视图
 * @param flag 视图值
 */
export declare const isView: (flag: unknown) => flag is View;
/**
 * 根据视图值返回视图
 * @param flag 视图值
 */
export declare const flagView: (flag: View) => "week" | "month" | "schedule";
/**
 * 初始化星期
 * @param weeks 星期
 */
export declare const initWeeks: (weeks?: string) => CalendarWeek[];
