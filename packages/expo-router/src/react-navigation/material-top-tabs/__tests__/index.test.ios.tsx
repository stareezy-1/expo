import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Button, Text as NativeText, View } from 'react-native';

import { NavigationContainer } from '../../../fork/NavigationContainer';
import { Text } from '../../elements';
import type { Route } from '../../native';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabBarProps,
  type MaterialTopTabScreenProps,
} from '../index';

type TopTabParamList = {
  A: undefined;
  B: undefined;
};

jest.mock('react-native-pager-view', () => {
  const React = require('react');
  const { View } = require('react-native');

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  return class ViewPager extends React.Component<React.PropsWithChildren<{}>> {
    setPage() {}

    render() {
      return <View>{this.props.children}</View>;
    }
  };
});

jest.mock(
  'react-native-tab-view',
  () => {
    const { View, Text, Pressable } = require('react-native');

    return {
      TabView: ({ navigationState, renderScene, renderTabBar }: any) => {
        return (
          <View>
            {renderTabBar({
              navigationState,
              options: {},
            })}
            {renderScene({
              route: navigationState.routes[navigationState.index],
              position: { interpolate: () => 0 },
            })}
          </View>
        );
      },
      TabBar: ({ navigationState, onTabPress, options }: any) => {
        return (
          <View>
            {navigationState.routes.map((route: any) => (
              <Pressable
                key={route.key}
                onPress={() => onTabPress({ route, preventDefault: () => {} })}>
                <Text>{options?.[route.key]?.labelText ?? route.name}</Text>
              </Pressable>
            ))}
          </View>
        );
      },
      TabBarIndicator: () => null,
    };
  },
  { virtual: true }
);

test('renders a material top tab navigator with screens', async () => {
  const Test = ({ route, navigation }: MaterialTopTabScreenProps<TopTabParamList>) => (
    <View>
      <Text>Screen {route.name}</Text>
      <Button onPress={() => navigation.navigate('A')} title="Go to A" />
      <Button onPress={() => navigation.navigate('B')} title="Go to B" />
    </View>
  );

  const Tab = createMaterialTopTabNavigator<TopTabParamList>();

  const { findByText, queryByText } = render(
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="A" component={Test} />
        <Tab.Screen name="B" component={Test} />
      </Tab.Navigator>
    </NavigationContainer>
  );

  expect(queryByText('Screen A')).not.toBeNull();
  expect(queryByText('Screen B')).toBeNull();

  fireEvent(await findByText('Go to B'), 'press');

  expect(queryByText('Screen B')).not.toBeNull();
});

test('renders tabs in route names order while preserving focus', async () => {
  const Tab = createMaterialTopTabNavigator<TopTabParamList>();
  let reverse!: () => void;

  function TestNavigator() {
    const [reversed, setReversed] = useState(false);
    reverse = () => setReversed(true);
    const screens = [
      <Tab.Screen key="A" name="A">
        {({ navigation }) => (
          <View>
            <Text>Screen A</Text>
            <Button title="Go to B" onPress={() => navigation.navigate('B')} />
          </View>
        )}
      </Tab.Screen>,
      <Tab.Screen key="B" name="B">
        {() => <Text>Screen B</Text>}
      </Tab.Screen>,
    ];
    return (
      <Tab.Navigator
        tabBar={({ state }: MaterialTopTabBarProps) => (
          <View>
            {state.routes.map((route: Route<string>, index: number) => (
              <NativeText key={route.key} testID={`tab-${index}`}>
                {route.name}:{route.key === state.routes[state.index]!.key ? 'focused' : 'blurred'}
              </NativeText>
            ))}
          </View>
        )}>
        {reversed ? screens.reverse() : screens}
      </Tab.Navigator>
    );
  }

  const { findByText, getByTestId, queryByText } = render(
    <NavigationContainer>
      <TestNavigator />
    </NavigationContainer>
  );

  fireEvent(await findByText('Go to B'), 'press');
  act(reverse);

  expect(getByTestId('tab-0')).toHaveTextContent('B:focused');
  expect(getByTestId('tab-1')).toHaveTextContent('A:blurred');
  expect(queryByText('Screen B')).not.toBeNull();
});
