import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  ImageSourcePropType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

type BouncingImageLoadingProps = {
  imageSize?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

type LoadingImageProps = {
  source: ImageSourcePropType;
  imageSize: number;
  index: number;
  total: number;
};

const LOADING_IMAGES: ImageSourcePropType[] = [
  require('../../../assets/images/loading/baimao.png'),
  require('../../../assets/images/loading/bianmu.png'),
  require('../../../assets/images/loading/buoumao.png'),
  require('../../../assets/images/loading/cangao.png'),
  require('../../../assets/images/loading/cangshu.png'),
  require('../../../assets/images/loading/chaiquan.png'),
  require('../../../assets/images/loading/fadou.png'),
  require('../../../assets/images/loading/gengduomaochong.png'),
  require('../../../assets/images/loading/gengduoquanzhong.png'),
  require('../../../assets/images/loading/hashiqi.png'),
  require('../../../assets/images/loading/heimao.png'),
  require('../../../assets/images/loading/helanzhu.png'),
  require('../../../assets/images/loading/jinmao.png'),
  require('../../../assets/images/loading/jumao.png'),
  require('../../../assets/images/loading/kedaya.png'),
  require('../../../assets/images/loading/keji.png'),
  require('../../../assets/images/loading/lachangquan.png'),
  require('../../../assets/images/loading/lanmao.png'),
  require('../../../assets/images/loading/nainiumao.png'),
  require('../../../assets/images/loading/sanhuamao.png'),
  require('../../../assets/images/loading/tianyuanquan.png'),
  require('../../../assets/images/loading/wumaomao.png'),
  require('../../../assets/images/loading/xianluomao.png'),
  require('../../../assets/images/loading/yang.png'),
];

const PULSE_STEP_MS = 260;
const PULSE_DURATION_MS = 130;

export function BouncingImageLoading({ imageSize = 32, height = 180, style }: BouncingImageLoadingProps) {
  return (
    <View
      accessible={false}
      style={[styles.stage, { height }, style]}>
      {LOADING_IMAGES.map((source, index) => (
        <LoadingImage
          key={index}
          source={source}
          imageSize={imageSize}
          index={index}
          total={LOADING_IMAGES.length}
        />
      ))}
    </View>
  );
}

function LoadingImage({ source, imageSize, index, total }: LoadingImageProps) {
  const progress = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(index * PULSE_STEP_MS),
        Animated.timing(progress, {
          toValue: 1,
          duration: PULSE_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: PULSE_DURATION_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(Math.max(0, total - index - 1) * PULSE_STEP_MS),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [index, progress, total]);

  return (
    <Animated.Image
      source={source}
      resizeMode="contain"
      style={[
        styles.image,
        {
          width: imageSize,
          height: imageSize,
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.38],
              }),
            },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  stage: {
    alignSelf: 'stretch',
    alignContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    margin: 2,
  },
});
