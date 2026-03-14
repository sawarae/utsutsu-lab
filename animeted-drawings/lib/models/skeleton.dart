import 'dart:math' as math;
import 'package:vector_math/vector_math_64.dart';

class Joint {
  final String name;
  final String? parentName;

  /// Rest position in image coordinates (pixels)
  final Vector2 restPos;
  Joint? parent;
  final List<Joint> children = [];

  Joint({
    required this.name,
    required this.parentName,
    required this.restPos,
  });
}

class Skeleton {
  final List<Joint> joints;
  final Map<String, Joint> jointMap;

  /// Maps BVH joint name -> character joint name
  final Map<String, String> bvhMapping;
  final int imageWidth;
  final int imageHeight;

  Skeleton({
    required this.joints,
    required this.jointMap,
    required this.bvhMapping,
    required this.imageWidth,
    required this.imageHeight,
  });

  factory Skeleton.fromJson(Map<String, dynamic> json) {
    final imgW = json['image_width'] as int;
    final imgH = json['image_height'] as int;
    final jointsJson = json['joints'] as Map<String, dynamic>;
    final mappingJson =
        json['bvh_joint_mapping'] as Map<String, dynamic>? ?? {};

    final jointMap = <String, Joint>{};
    for (final entry in jointsJson.entries) {
      final jData = entry.value as Map<String, dynamic>;
      jointMap[entry.key] = Joint(
        name: entry.key,
        parentName: jData['parent'] as String?,
        restPos: Vector2(
          (jData['x'] as num).toDouble(),
          (jData['y'] as num).toDouble(),
        ),
      );
    }

    // Build parent-child tree
    for (final joint in jointMap.values) {
      if (joint.parentName != null) {
        final parent = jointMap[joint.parentName];
        if (parent != null) {
          joint.parent = parent;
          parent.children.add(joint);
        }
      }
    }

    final bvhMapping = <String, String>{};
    for (final entry in mappingJson.entries) {
      bvhMapping[entry.key] = entry.value as String;
    }

    return Skeleton(
      joints: jointMap.values.toList(),
      jointMap: jointMap,
      bvhMapping: bvhMapping,
      imageWidth: imgW,
      imageHeight: imgH,
    );
  }

  /// Compute deformed joint positions given BVH rotations for a frame.
  /// Returns map of joint name -> deformed 2D position in image space.
  Map<String, Vector2> computeDeformedPositions(
    Map<String, Matrix4> bvhRotations,
  ) {
    // Build reverse mapping: charJointName -> list of BVH rotation matrices
    final charRotations = <String, Matrix4>{};
    for (final entry in bvhMapping.entries) {
      final bvhRot = bvhRotations[entry.key];
      if (bvhRot != null) {
        charRotations[entry.value] = bvhRot;
      }
    }

    // Find root (no parent)
    final rootJoint = joints.firstWhere((j) => j.parent == null);
    final result = <String, Vector2>{};

    void traverse(Joint joint, Vector2 parentPos, double parentAngle) {
      // Get local rotation angle for this joint (Z-axis rotation in 2D)
      double localAngle = 0.0;
      final rot = charRotations[joint.name];
      if (rot != null) {
        localAngle = _extractZAngle(rot);
      }

      final worldAngle = parentAngle + localAngle;

      Vector2 deformedPos;
      if (joint.parent == null) {
        // Root stays at rest position
        deformedPos = joint.restPos.clone();
      } else {
        // Compute rest-pose bone vector
        final restOffset = joint.restPos - joint.parent!.restPos;
        final boneLength = restOffset.length;

        if (boneLength < 0.001) {
          deformedPos = parentPos.clone();
        } else {
          // Original angle of bone in rest pose
          final restAngle = math.atan2(restOffset.y, restOffset.x);
          // Apply world rotation
          final newAngle = restAngle + worldAngle;
          deformedPos = Vector2(
            parentPos.x + boneLength * math.cos(newAngle),
            parentPos.y + boneLength * math.sin(newAngle),
          );
        }
      }

      result[joint.name] = deformedPos;

      for (final child in joint.children) {
        traverse(child, deformedPos, worldAngle);
      }
    }

    traverse(rootJoint, rootJoint.restPos, 0.0);
    return result;
  }

  double _extractZAngle(Matrix4 m) {
    // Extract Z rotation from 3D rotation matrix
    // Assumes Euler ZXY: angle_z = atan2(m[1][0], m[0][0])
    return math.atan2(m.entry(1, 0), m.entry(0, 0));
  }
}
