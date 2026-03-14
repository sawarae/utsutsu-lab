import 'dart:ui' as ui;

import 'package:animated_drawings/main.dart';
import 'package:animated_drawings/models/bvh_parser.dart';
import 'package:animated_drawings/models/skeleton.dart';
import 'package:animated_drawings/render/character_painter.dart';
import 'package:animated_drawings/render/skinning.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math_64.dart';

void main() {
  testWidgets('app loads the home screen controls', (tester) async {
    await tester.pumpWidget(const AnimatedDrawingsApp());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('AnimatedDrawings - Flutter Web'), findsOneWidget);
    expect(find.text('Motion: '), findsOneWidget);
    expect(find.text('Speed:'), findsOneWidget);
  });

  test('BVH parser preserves parent-child relationships', () {
    const sampleBvh = '''
HIERARCHY
ROOT Hips
{
  OFFSET 0.00 0.00 0.00
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0.00 5.21 0.00
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT Head
    {
      OFFSET 0.00 3.87 0.00
      CHANNELS 3 Zrotation Xrotation Yrotation
      End Site
      {
        OFFSET 0.00 4.50 0.00
      }
    }
  }
}
MOTION
Frames: 1
Frame Time: 0.033333
0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00 0.00
''';

    final bvh = BvhParser.parse(sampleBvh);
    final spine = bvh.root.children.single;
    final head = spine.children.single;

    expect(spine.parent, same(bvh.root));
    expect(head.parent, same(spine));
    expect(bvh.joints.first, same(bvh.root));
  });

  test('CharacterPainter repaints when debug overlay changes', () async {
    final rootJoint = Joint(
      name: 'root',
      parentName: null,
      restPos: Vector2(10, 20),
    );
    final skeleton = Skeleton(
      joints: [rootJoint],
      jointMap: {'root': rootJoint},
      bvhMapping: const {},
      imageWidth: 100,
      imageHeight: 200,
    );
    final skinning = SkinningEngine(skeleton);
    final image = await _createTestImage();
    final positions = {'root': rootJoint.restPos.clone()};

    final original = CharacterPainter(
      texture: image,
      skeleton: skeleton,
      skinning: skinning,
      deformedJointPositions: positions,
      debugSkeleton: false,
    );
    final toggled = CharacterPainter(
      texture: image,
      skeleton: skeleton,
      skinning: skinning,
      deformedJointPositions: positions,
      debugSkeleton: true,
    );

    expect(toggled.shouldRepaint(original), isTrue);
  });
}

Future<ui.Image> _createTestImage() async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  canvas.drawRect(
    const ui.Rect.fromLTWH(0, 0, 1, 1),
    ui.Paint()..color = const ui.Color(0xFFFFFFFF),
  );
  final picture = recorder.endRecording();
  return picture.toImage(1, 1);
}
