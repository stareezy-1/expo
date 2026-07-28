'use client';
import * as React from 'react';

import { orderRoutesByRouteNames } from '../../../utils/orderRoutesByRouteNames';
import {
  CommonActions,
  DrawerActions,
  type DrawerNavigationState,
  type ParamListBase,
  useLinkBuilder,
} from '../../native';
import type { DrawerDescriptorMap, DrawerNavigationHelpers } from '../types';
import { DrawerItem } from './DrawerItem';

type Props = {
  state: DrawerNavigationState<ParamListBase>;
  navigation: DrawerNavigationHelpers;
  descriptors: DrawerDescriptorMap;
};

/**
 * Component that renders the navigation list in the drawer.
 */
export function DrawerItemList({ state, navigation, descriptors }: Props) {
  const { buildHref } = useLinkBuilder();

  const focusedRoute = state.routes[state.index]!;
  const focusedDescriptor = descriptors[focusedRoute!.key]!;
  const focusedOptions = focusedDescriptor.options;

  const {
    drawerActiveTintColor,
    drawerInactiveTintColor,
    drawerActiveBackgroundColor,
    drawerInactiveBackgroundColor,
  } = focusedOptions;

  return orderRoutesByRouteNames(state.routes, state.routeNames).map((route) => {
    const focused = route.key === focusedRoute.key;

    const onPress = () => {
      const event = navigation.emit({
        type: 'drawerItemPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!event.defaultPrevented) {
        navigation.dispatch({
          ...(focused ? DrawerActions.closeDrawer() : CommonActions.navigate(route)),
          target: state.key,
        });
      }
    };

    const {
      title,
      drawerLabel,
      drawerIcon,
      drawerLabelStyle,
      drawerItemStyle,
      drawerAllowFontScaling,
    } = descriptors[route.key]!.options;

    return (
      <DrawerItem
        key={route.key}
        route={route}
        href={buildHref(route.name, route.params)}
        label={drawerLabel !== undefined ? drawerLabel : title !== undefined ? title : route.name}
        icon={drawerIcon}
        focused={focused}
        activeTintColor={drawerActiveTintColor}
        inactiveTintColor={drawerInactiveTintColor}
        activeBackgroundColor={drawerActiveBackgroundColor}
        inactiveBackgroundColor={drawerInactiveBackgroundColor}
        allowFontScaling={drawerAllowFontScaling}
        labelStyle={drawerLabelStyle}
        style={drawerItemStyle}
        onPress={onPress}
      />
    );
  }) as React.ReactNode as React.ReactElement;
}
