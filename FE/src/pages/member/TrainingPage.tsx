import { useAuth } from "../../context/AuthContext";
import { TrainingPlans, memberIdFromProfile } from "../../shared/TrainingPlans";
export function TrainingPage() {
  const { user } = useAuth();
  return (
    <div className="workflow-page">
      <h1>Kế hoạch & kết quả tập luyện</h1>
      <TrainingPlans memberId={memberIdFromProfile(user)} role="MEMBER" />
    </div>
  );
}
